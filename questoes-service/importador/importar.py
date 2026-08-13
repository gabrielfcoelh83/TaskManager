#!/usr/bin/env python3
"""
Extrai um Exame de Ordem (prova + gabarito da FGV) para JSON validado.

    python3 importar.py --exame 45 --tipo 1 \
        --prova prova45.pdf --gabarito gab45.pdf --saida oab45.json

Não escreve no banco. Produz um arquivo que o `carregar.js` insere depois —
extração e carga separadas de propósito: a extração precisa de poppler e
tesseract, que não têm por que existir dentro da imagem do serviço, e um
JSON intermediário pode ser conferido por uma pessoa antes de virar acervo.

SOBRE O TEXTO DOS PDFs
Alguns cadernos da FGV extraem limpo. Outros vêm com a fonte cifrada —
índices de glifo deslocados de 0x100, sem tabela ToUnicode — e o
`pdftotext` devolve "ůĠŵ ĚĞƐƚĞ ĐĂĚĞƌŶŽ" no lugar de "Além deste caderno".
Tentar decifrar é caminho errado: o PDF DESENHA as letras certas, então
rasterizar e reconhecer resolve sem depender da tabela. A escolha entre os
dois caminhos é automática, medindo se o texto extraído parece português.

SOBRE AS COLUNAS
A prova é diagramada em duas colunas. OCR na página inteira intercala as
duas e destrói o texto. Cada metade é reconhecida separadamente.
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

LARGURA_A4_300DPI = 2480
ALTURA_A4_300DPI = 3508


def rodar(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, check=False, **kw).stdout


def parece_portugues(texto):
    """Heurística barata para decidir entre texto extraído e OCR.

    Texto são tem muitas vogais ASCII. Texto cifrado por glifo cai em faixas
    Unicode altas e quase não tem vogal ASCII. A diferença é ordens de
    grandeza, então o limiar não precisa ser fino.
    """
    amostra = texto[:4000]
    if not amostra:
        return False
    vogais = sum(amostra.count(c) for c in 'aeiouAEIOU')
    return vogais / len(amostra) > 0.15


def texto_por_extracao(pdf):
    return rodar(['pdftotext', '-layout', str(pdf), '-'])


def texto_por_ocr(pdf, primeira_pagina=1):
    paginas = int(re.search(r'Pages:\s+(\d+)', rodar(['pdfinfo', str(pdf)])).group(1))
    metade = LARGURA_A4_300DPI // 2
    partes = []

    with tempfile.TemporaryDirectory() as tmp:
        for p in range(primeira_pagina, paginas + 1):
            for i, x in enumerate((0, metade)):
                prefixo = f'{tmp}/p{p}-{i}'
                rodar(['pdftoppm', '-r', '300', '-f', str(p), '-l', str(p), '-png',
                       '-x', str(x), '-y', '0', '-W', str(metade), '-H', str(ALTURA_A4_300DPI),
                       str(pdf), prefixo])
                for png in sorted(Path(tmp).glob(f'p{p}-{i}*.png')):
                    partes.append(rodar(['tesseract', str(png), '-', '-l', 'por', '--psm', '6']))
                    png.unlink()

    return '\n'.join(partes)


def ler_gabarito(pdf, tipo):
    """Lê o gabarito definitivo. A grade é 'linha de números / linha de letras'."""
    texto = rodar(['pdftotext', '-layout', str(pdf), '-'])

    marcador = f'PROVA TIPO {tipo}'
    if marcador not in texto:
        raise SystemExit(f'gabarito não contém "{marcador}"')

    bloco = texto.split(marcador, 1)[1].split('PROVA TIPO', 1)[0]
    linhas = [l for l in bloco.split('\n') if l.strip()]

    gabarito = {}
    for i in range(len(linhas) - 1):
        nums = linhas[i].split()
        letras = linhas[i + 1].split()
        if not nums or not all(n.isdigit() for n in nums):
            continue
        if len(letras) != len(nums) or not all(l in 'ABCD' for l in letras):
            continue
        for n, l in zip(nums, letras):
            gabarito[int(n)] = 'ABCD'.index(l)

    return gabarito


# Depois da questão 80 o caderno traz um questionário de opinião sobre a
# própria prova — "o grau de dificuldade desta prova foi", "qual foi o tempo
# gasto" — numerado de 1 a 10 e com alternativas no mesmo formato. Para o
# parser é indistinguível de questão, e no 42º Exame ele montou as dez como se
# fossem, reiniciando a numeração e produzindo 86 blocos.
#
# Cortar pelo cabeçalho é melhor que parar em 80: se a fatia perder uma
# questão no meio, parar em 80 engoliria a primeira pergunta do questionário
# para fechar a conta, e o resultado seria um acervo com pergunta de pesquisa
# no lugar de questão de Direito.
MARCADOR_DO_QUESTIONARIO = re.compile(
    r'question[áa]rio\s+de\s+percep[çc][ãa]o|question[áa]rio.{0,20}facultativo',
    re.IGNORECASE,
)


def cortar_no_questionario(texto):
    """Descarta o questionário de opinião do fim do caderno.

    O marcador aparece DUAS vezes, e cortar na primeira apaga a prova
    inteira: as instruções da capa anunciam "este caderno contendo 80
    questões objetivas e o questionário de percepção sobre a prova". Só a
    ocorrência do fim delimita o questionário de verdade.

    Ignorar o primeiro terço resolve com folga — as instruções cabem em duas
    páginas e as 80 questões ocupam o resto — e é mais estável que cortar na
    última ocorrência, que cairia no meio do questionário se ele se
    mencionasse de novo.
    """
    piso = len(texto) // 3
    for achado in MARCADOR_DO_QUESTIONARIO.finditer(texto):
        if achado.start() >= piso:
            return texto[: achado.start()]
    return texto


def montar_questoes(texto):
    """Fatia o texto corrido em questões.

    Número da questão sozinho numa linha, enunciado, e as alternativas
    abertas por A a D. Linhas de continuação pertencem ao último bloco
    aberto — sem isso, alternativa longa perde tudo depois da primeira
    linha.

    O parêntese de abertura é OPCIONAL porque o caderno não é tão estável
    quanto parecia: o 45º Exame abre as alternativas com "(A)" e o 42º com
    "A)". Exigir "(A)" fazia o 42º montar ZERO questões — e, por sorte, a
    validação de 80 barrou o exame inteiro em vez de importar um pedaço.
    Aceitar as duas formas não afrouxa a fatia: a ordem A→B→C→D continua
    obrigatória logo abaixo, e é ela que impede uma linha começada por "A)"
    no meio de um texto de virar alternativa.
    """
    questoes, atual, alvo = [], None, None

    def fechar():
        if atual and len(atual['alternativas']) == 4:
            atual['enunciado'] = ' '.join(atual['enunciado']).strip()
            atual['alternativas'] = [' '.join(a).strip() for a in atual['alternativas']]
            questoes.append(atual)

    for linha in texto.split('\n'):
        s = linha.strip()
        if not s:
            continue

        alt = re.match(r'^\(?([A-D])\)\s*(.*)', s)
        num = re.fullmatch(r'(\d{1,2})', s)

        if alt:
            if atual is None:
                continue
            esperada = 'ABCD'[len(atual['alternativas'])] if len(atual['alternativas']) < 4 else None
            # Alternativa fora de ordem significa que a fatia se perdeu.
            # Ignorar em silêncio produziria questão com resposta trocada,
            # que é exatamente o defeito que este serviço existe para evitar.
            if alt.group(1) != esperada:
                atual = None
                continue
            atual['alternativas'].append([alt.group(2)])
            alvo = atual['alternativas'][-1]
        elif num and 1 <= int(num.group(1)) <= 80:
            fechar()
            atual = {'numero': int(num.group(1)), 'enunciado': [], 'alternativas': []}
            alvo = atual['enunciado']
        elif atual is not None and alvo is not None:
            # Cabeçalho e rodapé repetidos em toda página não são conteúdo.
            if re.search(r'EXAME (DE|DO) ORDEM|CONSELHO FEDERAL|Tipo\s+\w+\s+–', s):
                continue
            alvo.append(s)

    fechar()
    return questoes


def renumerar_por_posicao(questoes):
    """A posição no caderno vale mais que o número impresso.

    O OCR lê o enunciado muito bem e erra o número da questão, que é um
    dígito grande e isolado: no 45º Exame ele leu "75" como "15". Mas as
    questões aparecem em ordem, então a n-ésima é a questão n — e o número
    reconhecido serve melhor como CONFERÊNCIA do que como fonte.

    A conferência é o que separa "o OCR errou um dígito" de "uma questão se
    perdeu na fatia". No primeiro caso a sequência continua crescente com um
    furo isolado; no segundo ela quebra. Só o primeiro é consertável, e
    exigir 90% de acerto impede que uma extração realmente torta passe por
    renumeração.
    """
    if len(questoes) != 80:
        return questoes, []

    divergentes = [(i + 1, q['numero']) for i, q in enumerate(questoes) if q['numero'] != i + 1]

    if len(divergentes) > 8:  # mais de 10% divergindo não é erro de OCR
        return questoes, []

    for i, q in enumerate(questoes):
        q['numero'] = i + 1

    return questoes, divergentes


def validar(questoes, gabarito):
    """Porta de entrada do acervo.

    Rejeita o exame INTEIRO, e não a questão problemática. Um exame com 79
    questões é sinal de que a fatia se perdeu em algum lugar, e a questão
    que sobrou pode estar com o enunciado de uma e as alternativas de outra
    — importar 79 seria pior que importar nenhuma, porque parece sucesso.
    """
    erros = []
    numeros = [q['numero'] for q in questoes]

    if len(questoes) != 80:
        erros.append(f'{len(questoes)} questões montadas, esperadas 80')

    faltando = [n for n in range(1, 81) if n not in numeros]
    if faltando:
        erros.append(f'faltando: {faltando}')

    repetidos = sorted({n for n in numeros if numeros.count(n) > 1})
    if repetidos:
        erros.append(f'repetidos: {repetidos}')

    if len(gabarito) != 80:
        erros.append(f'gabarito com {len(gabarito)} entradas, esperadas 80')

    for q in questoes:
        if len(q['alternativas']) != 4:
            erros.append(f'questão {q["numero"]}: {len(q["alternativas"])} alternativas')
        if any(not a for a in q['alternativas']):
            erros.append(f'questão {q["numero"]}: alternativa vazia')
        if len(q['enunciado']) < 40:
            erros.append(f'questão {q["numero"]}: enunciado com {len(q["enunciado"])} chars')
        if q['numero'] not in gabarito:
            erros.append(f'questão {q["numero"]}: sem gabarito oficial')

    return erros


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--exame', type=int, required=True)
    p.add_argument('--tipo', type=int, default=1)
    p.add_argument('--ano', type=int)
    p.add_argument('--prova', required=True)
    p.add_argument('--gabarito', required=True)
    p.add_argument('--saida', required=True)
    p.add_argument('--forcar-ocr', action='store_true')
    args = p.parse_args()

    print(f'lendo gabarito definitivo (tipo {args.tipo})...')
    gabarito = ler_gabarito(args.gabarito, args.tipo)
    print(f'  {len(gabarito)} respostas oficiais')

    texto = '' if args.forcar_ocr else texto_por_extracao(args.prova)
    if args.forcar_ocr or not parece_portugues(texto):
        print('texto ilegível na extração direta — caindo para OCR (demora)...')
        texto = texto_por_ocr(args.prova)
    else:
        print('texto extraído direto do PDF')

    texto = cortar_no_questionario(texto)
    questoes = montar_questoes(texto)
    print(f'  {len(questoes)} questões montadas')

    questoes, corrigidos = renumerar_por_posicao(questoes)
    for posicao, lido in corrigidos:
        print(f'  número corrigido pela posição: OCR leu {lido}, é a questão {posicao}')

    erros = validar(questoes, gabarito)
    if erros:
        print(f'\n❌ exame REJEITADO — {len(erros)} problema(s):', file=sys.stderr)
        for e in erros[:20]:
            print(f'   - {e}', file=sys.stderr)
        sys.exit(1)

    saida = [{
        'exame': args.exame,
        'tipo_prova': args.tipo,
        'numero': q['numero'],
        'banca': 'FGV',
        'ano': args.ano,
        'enunciado': q['enunciado'],
        'alternativas': q['alternativas'],
        'gabarito': gabarito[q['numero']],
    } for q in sorted(questoes, key=lambda q: q['numero'])]

    Path(args.saida).write_text(json.dumps(saida, ensure_ascii=False, indent=2))
    print(f'\n✅ {len(saida)} questões válidas em {args.saida}')


if __name__ == '__main__':
    main()
