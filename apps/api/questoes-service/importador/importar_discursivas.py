#!/usr/bin/env python3
"""
Extrai as 4 questões discursivas da 2ª fase (prova prático-profissional) de
um Exame de Ordem, numa área, para JSON validado.

    python3 importar_discursivas.py --exame 44 --area civil \
        --pdf padrao44.pdf [--prova caderno44.pdf] --saida civil44.json

Mesmo espírito do importar.py: não escreve no banco. O JSON sai daqui, uma
pessoa pode conferir, e o `carregar_discursivas.js` é quem insere.

A peça prático-profissional é ignorada de propósito nesta etapa: só as
quatro questões.

DE ONDE VEM CADA PARTE
O "Padrão de Resposta" da FGV traz, por questão, o ENUNCIADO (caso + itens
com o valor de cada um) e o GABARITO COMENTADO. Em vários exames (38º, 40º a
43º) o enunciado desse PDF é uma IMAGEM — o texto extraído sai com o título
"Enunciado" e nada embaixo. O caderno de prova do mesmo exame traz o mesmo
texto em fonte de verdade, então `--prova` preenche o que o padrão não tem.
Reconhecer a imagem por OCR seria a alternativa, mas trocaria texto exato por
texto provável sem necessidade.

QUAL PDF USAR
A FGV publica o padrão de resposta duas vezes: o preliminar, logo depois da
prova, e o definitivo, depois dos recursos, que acrescenta a "Distribuição
dos Pontos". O texto do gabarito muda entre os dois (no 42º, "podem ser
responsabilizados" virou "podem ser obrigados"). O nome do arquivo não diz
qual é qual; a tabela de distribuição diz, e o importador avisa quando ela
falta.
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

AREAS = {
    'civil': 'DIREITO CIVIL',
    'penal': 'DIREITO PENAL',
    'trabalho': 'DIREITO DO TRABALHO',
    'administrativo': 'DIREITO ADMINISTRATIVO',
    'constitucional': 'DIREITO CONSTITUCIONAL',
    'empresarial': 'DIREITO EMPRESARIAL',
    'tributario': 'DIREITO TRIBUTÁRIO',
}

QUESTOES_POR_EXAME = 4
LETRAS = 'ABCDE'


# ───────────────────────────── leitura ─────────────────────────────

def rodar(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=False).stdout


def parece_portugues(texto):
    amostra = texto[:4000]
    if not amostra:
        return False
    vogais = sum(amostra.count(c) for c in 'aeiouAEIOU')
    return vogais / len(amostra) > 0.15


def texto_por_ocr(pdf):
    """OCR de página inteira. O padrão de resposta tem uma coluna só, então
    não precisa do corte em metades que o caderno objetivo exige."""
    paginas = int(re.search(r'Pages:\s+(\d+)', rodar(['pdfinfo', str(pdf)])).group(1))
    partes = []
    with tempfile.TemporaryDirectory() as tmp:
        for p in range(1, paginas + 1):
            prefixo = f'{tmp}/p{p}'
            rodar(['pdftoppm', '-r', '300', '-f', str(p), '-l', str(p), '-png', str(pdf), prefixo])
            for png in sorted(Path(tmp).glob(f'p{p}*.png')):
                partes.append(rodar(['tesseract', str(png), '-', '-l', 'por', '--psm', '6']))
                png.unlink()
    return '\n'.join(partes)


def ler_texto(caminho, forcar_ocr=False):
    """Aceita PDF ou o .txt já extraído (`pdftotext -layout`) — o segundo é o
    que os testes usam, e serve para quem não tem poppler à mão."""
    caminho = Path(caminho)
    if caminho.suffix.lower() == '.txt':
        return caminho.read_text(encoding='utf-8')
    texto = '' if forcar_ocr else rodar(['pdftotext', '-layout', str(caminho), '-'])
    if forcar_ocr or not parece_portugues(texto):
        print(f'OCR em {caminho.name} (texto extraído ilegível) — demora...', file=sys.stderr)
        texto = texto_por_ocr(caminho)
    return texto


# ─────────────────────────── limpeza ───────────────────────────────

# Cabeçalho e rodapé que a FGV repete em toda página. Qualquer um deles no
# meio de um enunciado que atravessa a página viraria frase do caso.
LIXO_DE_PAGINA = [
    re.compile(p, re.IGNORECASE) for p in (
        r'^ORDEM DOS ADVOGADOS DO BRASIL$',
        r'^[\wºª°]+\s+EXAME D[EO] ORDEM UNIFICADO$',
        r'^Prova Pr[áa]tico[- ]Profissional\b.*(Aplicada em|P[áa]gina)',
        r'^Prova Pr[áa]tico[- ]Profissional$',
        r'^Aplicada em \d',
        r'^[ÁA]REA:\s',
        r'^Padr[ãa]o de Resposta da Prova\b',
        r'^P[áa]gina\s+\d+',
        r'^“?O gabarito preliminar da prova',
        r'^podendo ser alterado at[ée] a divulga[çc][ãa]o do padr[ãa]o',
        r'^Qualquer semelhan[çc]a nominal',
        r'^QUEST[ÃA]O\s+\d+\s+[–-]\s+P[ÁA]GINA\s+\d+$',
        r'^\d+$',  # numeração das linhas da folha de rascunho do caderno
    )
]

# Aviso genérico que acompanha toda questão ("Obs.: o(a) examinando(a) deve
# fundamentar..."). Não é parte do caso e repetido em cada tela só ocupa
# espaço. Casa só o "Obs.:" do começo porque o resto varia de exame para
# exame — o 40º traz "O(Aa) examinando(a)", erro de digitação da banca, e um
# padrão mais estrito deixava o aviso colado na pergunta do item B.
OBS = re.compile(r'^Obs\.?:', re.IGNORECASE)


def linhas_limpas(texto):
    saida = []
    for bruta in texto.replace('\f', '\n').split('\n'):
        s = re.sub(r'\s+', ' ', bruta).strip()
        if not s:
            saida.append('')
            continue
        if any(p.search(s) for p in LIXO_DE_PAGINA):
            continue
        saida.append(s)
    return saida


def juntar(linhas):
    """Junta linhas quebradas pela diagramação, preservando parágrafos.

    O `pdftotext -layout` quebra no fim de cada linha do PDF, sem distinguir
    fim de parágrafo. A pista que sobra é o comprimento: linha que termina em
    pontuação final e é bem mais curta que as vizinhas terminou o parágrafo;
    linha cheia só acabou a largura da página.
    """
    linhas = [l for l in linhas if l]
    if not linhas:
        return ''
    largura = max(len(l) for l in linhas)
    partes, atual = [], []
    for l in linhas:
        # "OU" sozinho separa respostas alternativas aceitas pela banca;
        # colado no parágrafo seguinte, parece parte da frase.
        if l.upper() == 'OU':
            if atual:
                partes.append(' '.join(atual))
            partes.append('OU')
            atual = []
            continue
        atual.append(l)
        if re.search(r'[.:?!”"]$', l) and len(l) < largura * 0.85:
            partes.append(' '.join(atual))
            atual = []
    if atual:
        partes.append(' '.join(atual))
    return '\n'.join(partes).strip()


def valor_num(txt):
    return round(float(txt.replace(',', '.')), 2)


# ─────────────────────────── fatias ────────────────────────────────

# "PADRÃO DE RESPOSTA – QUESTÃO 01" (36º–45º, na maioria) ou só "QUESTÃO 1"
# numa linha (39º, e o caderno de prova). A linha precisa ser só isso: um
# "questão 2" no meio de uma frase não abre bloco.
CABECALHO_QUESTAO = re.compile(
    r'^(?:PADR[ÃA]O DE RESPOSTA\s*[–-]\s*)?QUEST[ÃA]O\s+0?(\d)$', re.IGNORECASE)
CABECALHO_PECA = re.compile(r'PE[ÇC]A\s+(PR[ÁA]TICO-)?PROFISSIONAL$', re.IGNORECASE)
SECAO_ENUNCIADO = re.compile(r'^Enunciado$', re.IGNORECASE)
SECAO_GABARITO = re.compile(r'^Gabarito Comentado$', re.IGNORECASE)
SECAO_DISTRIBUICAO = re.compile(r'^Distribui[çc][ãa]o dos Pontos$', re.IGNORECASE)


def fatiar_questoes(linhas):
    """{numero: [linhas]} — cada bloco vai do cabeçalho da questão até o
    próximo cabeçalho (de questão ou de peça). Tudo antes da questão 1 é a
    peça, que fica de fora."""
    blocos, atual = {}, None
    for l in linhas:
        m = CABECALHO_QUESTAO.match(l)
        if m:
            atual = int(m.group(1))
            # Se o número aparecer duas vezes (não deveria), a primeira
            # ocorrência vence — é a que tem o conteúdo, a segunda seria
            # sobra de índice ou de rodapé.
            if atual in blocos:
                atual = None
                continue
            blocos[atual] = []
            continue
        if CABECALHO_PECA.search(l):
            atual = None
            continue
        if atual is not None:
            blocos[atual].append(l)
    return blocos


ITEM = re.compile(r'^([A-E])\)\s*(.*)$')
VALOR = re.compile(r'\(\s*Valor:?\s*(\d+,\d+)\s*\)', re.IGNORECASE)


def separar_enunciado(linhas):
    """Caso + itens. Os itens abrem com 'A)', 'B)'... em ordem; o valor vem
    entre parênteses no fim do item, às vezes na linha de baixo."""
    caso, itens, atual = [], [], None
    for l in linhas:
        if OBS.match(l):
            atual = 'fim'
            continue
        if atual == 'fim':
            continue
        m = ITEM.match(l)
        # Só a PRÓXIMA letra abre item: um "B)" fora de ordem é texto.
        proxima = LETRAS[len(itens)] if len(itens) < len(LETRAS) else None
        if m and m.group(1) == proxima:
            itens.append({'letra': m.group(1), 'linhas': [m.group(2)]})
            atual = itens[-1]
            continue
        if atual is None:
            caso.append(l)
        elif l:
            atual['linhas'].append(l)

    saida = []
    for it in itens:
        texto = ' '.join(x for x in it['linhas'] if x).strip()
        v = VALOR.search(texto)
        pergunta = VALOR.sub('', texto).strip()
        saida.append({'letra': it['letra'], 'pergunta': pergunta,
                      'valor': valor_num(v.group(1)) if v else None})
    return juntar(caso), saida


# Gabarito: "A) Não. ..." ou, no 39º, "A. Não. ...".
ITEM_GABARITO = re.compile(r'^([A-E])[.)]\s*(.*)$')


def separar_gabarito(linhas):
    itens, atual = {}, None
    esperada = 0
    for l in linhas:
        m = ITEM_GABARITO.match(l)
        if m and esperada < len(LETRAS) and m.group(1) == LETRAS[esperada]:
            atual = m.group(1)
            # O 43º traz "B) B. Camila e seus..." — a letra repetida é
            # diagramação, não resposta.
            itens[atual] = [re.sub(rf'^{atual}[.)]\s*', '', m.group(2))]
            esperada += 1
            continue
        if atual:
            itens[atual].append(l)
    return {k: juntar(v) for k, v in itens.items()}


# Tabela de duas colunas: à esquerda o critério, à direita as notas
# possíveis ("0,00/0,25/0,35/"). O layout mistura as duas na mesma linha.
# O 36º escreve "0,0/0,15", então a casa decimal pode ter um dígito só.
NOTAS_NO_FIM = re.compile(r'\s(\d,\d\d?/?)+$')
SO_NOTAS = re.compile(r'^(\d,\d\d?/?)+$')
# "A.", e subitens como "A.1." (36º) ou "A1." (39º em diante).
ITEM_DISTRIBUICAO = re.compile(r'^([A-E])(?:\.?\d+)?\.\s')
CABECALHO_TABELA = re.compile(r'^(ITEM|PONTUA[ÇC][ÃA]O)\b', re.IGNORECASE)


def separar_distribuicao(linhas):
    """Texto de 'Distribuição dos Pontos' por letra. Subitens (A.1, A.2)
    ficam juntos na letra. É complemento: se a tabela vier torta, o item
    simplesmente fica sem ela."""
    itens, atual = {}, None
    for l in linhas:
        if not l or CABECALHO_TABELA.match(l) or SO_NOTAS.match(l):
            continue
        l = NOTAS_NO_FIM.sub('', l).strip()
        m = ITEM_DISTRIBUICAO.match(l)
        if m:
            atual = m.group(1)
            itens.setdefault(atual, [])
            if itens[atual]:
                itens[atual].append('\n')
        if atual:
            itens[atual].append(l)
    saida = {}
    for k, partes in itens.items():
        blocos = ' '.join(partes).split(' \n ')
        saida[k] = '\n'.join(b.strip() for b in blocos if b.strip())
    return saida


def secoes(bloco):
    """Divide o bloco de uma questão em enunciado / gabarito / distribuição.
    No caderno de prova não há título de seção: tudo é enunciado."""
    atual, s = 'enunciado', {'enunciado': [], 'gabarito': [], 'distribuicao': []}
    for l in bloco:
        if SECAO_ENUNCIADO.match(l):
            atual = 'enunciado'
            continue
        if SECAO_GABARITO.match(l):
            atual = 'gabarito'
            continue
        if SECAO_DISTRIBUICAO.match(l):
            atual = 'distribuicao'
            continue
        s[atual].append(l)
    return s


def extrair(texto_padrao, texto_prova=None):
    """Monta as questões a partir do texto do padrão de resposta e,
    opcionalmente, do caderno de prova. Não valida — `validar` faz isso."""
    padrao = fatiar_questoes(linhas_limpas(texto_padrao))
    prova = fatiar_questoes(linhas_limpas(texto_prova)) if texto_prova else {}

    questoes = []
    for numero in sorted(padrao):
        s = secoes(padrao[numero])
        enunciado, itens = separar_enunciado(s['enunciado'])
        origem_enunciado = 'padrao'

        # Enunciado vazio no padrão = era imagem. O caderno tem o mesmo texto.
        if (not enunciado or not itens) and numero in prova:
            enunciado, itens = separar_enunciado(secoes(prova[numero])['enunciado'])
            origem_enunciado = 'prova'

        gabarito = separar_gabarito(s['gabarito'])
        distribuicao = separar_distribuicao(s['distribuicao'])

        # Os itens nascem do ENUNCIADO (é onde estão pergunta e valor). Letra
        # que só existe no gabarito fica sem pergunta, e a validação acusa.
        letras = [i['letra'] for i in itens] or sorted(gabarito)
        por_letra = {i['letra']: i for i in itens}
        montados = []
        for letra in letras:
            item = {
                'letra': letra,
                'pergunta': por_letra.get(letra, {}).get('pergunta', ''),
                'valor': por_letra.get(letra, {}).get('valor'),
                'gabarito': gabarito.get(letra, ''),
            }
            if distribuicao.get(letra):
                item['distribuicao'] = distribuicao[letra]
            montados.append(item)

        questoes.append({
            'numero': numero,
            'enunciado': enunciado,
            'itens': montados,
            'tem_distribuicao': bool(distribuicao),
            'origem_enunciado': origem_enunciado,
        })
    return questoes


# ─────────────────────────── validação ─────────────────────────────

def validar(questoes):
    """Rejeita o exame inteiro, pelo mesmo motivo do importar.py: três
    questões boas e uma torta parecem sucesso, e a torta pode ter o
    gabarito de uma questão com o enunciado de outra."""
    erros = []
    numeros = [q['numero'] for q in questoes]
    if sorted(numeros) != list(range(1, QUESTOES_POR_EXAME + 1)):
        erros.append(f'questões encontradas: {numeros}, esperadas 1..{QUESTOES_POR_EXAME}')

    for q in questoes:
        n = q['numero']
        if len(q['enunciado']) < 100:
            erros.append(f'questão {n}: enunciado com {len(q["enunciado"])} chars '
                         '(imagem no PDF? passe --prova com o caderno)')
        letras = [i['letra'] for i in q['itens']]
        if letras not in (['A', 'B'], ['A', 'B', 'C']):
            erros.append(f'questão {n}: itens {letras}, esperados A, B (ou A–C)')
        for i in q['itens']:
            rot = f'questão {n}{i["letra"]}'
            if len(i['pergunta']) < 10:
                erros.append(f'{rot}: pergunta vazia')
            if not isinstance(i['valor'], (int, float)) or not 0 < i['valor'] <= 5:
                erros.append(f'{rot}: valor {i["valor"]!r} inválido')
            if len(i['gabarito']) < 10:
                erros.append(f'{rot}: gabarito vazio')
    return erros


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--exame', type=int, required=True)
    p.add_argument('--area', required=True, choices=sorted(AREAS))
    p.add_argument('--pdf', required=True, help='padrão de resposta (PDF ou .txt)')
    p.add_argument('--prova', help='caderno de prova, para enunciado que é imagem no padrão')
    p.add_argument('--fonte', help='descrição da origem gravada em cada questão')
    p.add_argument('--saida', required=True)
    p.add_argument('--forcar-ocr', action='store_true')
    args = p.parse_args()

    texto = ler_texto(args.pdf, args.forcar_ocr)

    # Padrão de outra área no lugar do pedido: o arquivo tem o título da área
    # em toda página, e errar aqui gravaria questão de Penal como Civil.
    rotulo = AREAS[args.area]
    if not re.search(r'[ÁA]REA:\s*' + rotulo, texto, re.IGNORECASE):
        raise SystemExit(f'o PDF não diz "ÁREA: {rotulo}" — é o arquivo certo?')

    texto_prova = ler_texto(args.prova, args.forcar_ocr) if args.prova else None
    questoes = extrair(texto, texto_prova)

    if questoes and not any(q['tem_distribuicao'] for q in questoes):
        print('⚠️  sem "Distribuição dos Pontos": parece o padrão PRELIMINAR. O definitivo',
              file=sys.stderr)
        print('    sai depois dos recursos e pode mudar o gabarito.', file=sys.stderr)

    for q in questoes:
        if q['origem_enunciado'] == 'prova':
            print(f'  questão {q["numero"]}: enunciado veio do caderno de prova')

    erros = validar(questoes)
    if erros:
        print(f'\n❌ exame REJEITADO — {len(erros)} problema(s):', file=sys.stderr)
        for e in erros[:20]:
            print(f'   - {e}', file=sys.stderr)
        sys.exit(1)

    fonte = args.fonte or f'FGV – {args.exame}º Exame de Ordem – Padrão de Resposta – {rotulo.title()}'
    saida = [{
        'exame': args.exame,
        'area': args.area,
        'numero': q['numero'],
        'enunciado': q['enunciado'],
        'itens': q['itens'],
        'fonte': fonte,
    } for q in sorted(questoes, key=lambda q: q['numero'])]

    Path(args.saida).write_text(json.dumps(saida, ensure_ascii=False, indent=2))
    print(f'✅ {len(saida)} questões válidas em {args.saida}')


if __name__ == '__main__':
    main()
