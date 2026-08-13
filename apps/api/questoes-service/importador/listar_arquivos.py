#!/usr/bin/env python3
"""Lista os PDFs publicados pela FGV para um Exame de Ordem.

    python3 listar_arquivos.py 44
    python3 listar_arquivos.py 44 --baixar gabarito

A página de cada exame é um formulário ASP.NET: pedir a URL direto devolve
uma casca de 7 KB, sem link de arquivo nenhum. O conteúdo só aparece depois
de POSTar o formulário com __VIEWSTATE, __EVENTVALIDATION e uma seccional
escolhida — daí este script existir em vez de um `curl`.

Também não adianta procurar o arquivo pelo nome: a URL leva um id numérico
que não segue padrão (158882, 521435, 255635…) e não é adivinhável.
"""

import argparse
import html
import re
import sys
import urllib.parse
import urllib.request

# A página de cada exame é identificada por uma chave sequencial, deslocada
# de 603 em relação ao número do exame: o 40º é 643 e o 45º, 648.
DESLOCAMENTO = 603
BASE = 'https://oab.fgv.br'


def campo_oculto(fonte, nome):
    achado = re.search(rf'name="{nome}"[^>]*value="([^"]*)"', fonte)
    return html.unescape(achado.group(1)) if achado else ''


def listar(exame):
    url = f'{BASE}/home.aspx?key={exame + DESLOCAMENTO}'
    cabecalhos = {'User-Agent': 'Mozilla/5.0'}

    casca = urllib.request.urlopen(
        urllib.request.Request(url, headers=cabecalhos), timeout=40
    ).read().decode('utf-8', 'replace')

    seccionais = re.findall(r'<option[^>]*value="(\d+)"', casca)
    if not seccionais:
        raise SystemExit(f'{url}: sem lista de seccionais — a página mudou?')

    # Qualquer seccional serve: a lista de arquivos do exame é a mesma. O
    # campo existe para filtrar local de prova, não documento.
    dados = urllib.parse.urlencode({
        '__VIEWSTATE': campo_oculto(casca, '__VIEWSTATE'),
        '__VIEWSTATEGENERATOR': campo_oculto(casca, '__VIEWSTATEGENERATOR'),
        '__EVENTVALIDATION': campo_oculto(casca, '__EVENTVALIDATION'),
        'ctl00$ContentPlaceHolder1$listSeccional': seccionais[0],
    }).encode()

    corpo = urllib.request.urlopen(
        urllib.request.Request(
            url, data=dados,
            headers={**cabecalhos, 'Content-Type': 'application/x-www-form-urlencoded'},
        ), timeout=40
    ).read().decode('utf-8', 'replace')

    return sorted(set(re.findall(r'arq/\d+/[^"\'<>]+\.pdf', corpo)))


def baixar(caminho, destino):
    url = f'{BASE}/{caminho}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    conteudo = urllib.request.urlopen(req, timeout=120).read()
    if not conteudo.startswith(b'%PDF'):
        raise SystemExit(f'{url} não devolveu um PDF')
    open(destino, 'wb').write(conteudo)
    return len(conteudo)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('exame', type=int, help='número do Exame de Ordem, ex.: 44')
    p.add_argument('--filtro', help='mostra só os que contêm este texto no nome')
    p.add_argument('--baixar', help='baixa o primeiro que casa com --filtro, neste arquivo')
    args = p.parse_args()

    arquivos = listar(args.exame)
    if args.filtro:
        alvo = args.filtro.lower()
        arquivos = [a for a in arquivos if alvo in urllib.parse.unquote(a).lower()]

    if not arquivos:
        print('nenhum arquivo encontrado', file=sys.stderr)
        return 1

    for caminho in arquivos:
        print(urllib.parse.unquote(caminho))

    if args.baixar:
        tamanho = baixar(arquivos[0], args.baixar)
        print(f'\n→ {args.baixar} ({tamanho // 1024} KB)', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
