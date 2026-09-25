"""Testes do parser das discursivas contra recortes REAIS dos PDFs da FGV.

    python3 -m unittest -v test_importar_discursivas     (dentro de importador/)

Roda também pelo `npm test` do serviço (tests/importador_discursivas.test.js),
que é o que o CI executa.

Os fixtures são o `pdftotext -layout` dos padrões de resposta publicados pela
FGV — conteúdo público — cortados no mínimo que exercita cada formato:

  padrao44_q1_q2.txt  44º, formato atual: ENUNCIADO / GABARITO COMENTADO,
                      com cabeçalho e rodapé de página entre as questões
  padrao39_q1.txt     39º: "QUESTÃO 1" sem o "PADRÃO DE RESPOSTA", gabarito
                      em "A." e tabela de distribuição com subitens "A1."
  padrao42_q1.txt     42º: enunciado é imagem no PDF (seção vazia)
  prova42_q1.txt      o mesmo enunciado no caderno de prova
"""

import unittest
from pathlib import Path

from importar_discursivas import extrair, linhas_limpas, validar

FIX = Path(__file__).parent / 'fixtures'


def ler(nome):
    return (FIX / nome).read_text(encoding='utf-8')


class Padrao44(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.qs = {q['numero']: q for q in extrair(ler('padrao44_q1_q2.txt'))}

    def test_acha_as_duas_questoes(self):
        self.assertEqual(sorted(self.qs), [1, 2])

    def test_enunciado_sem_cabecalho_de_pagina(self):
        e = self.qs[2]['enunciado']
        self.assertTrue(e.startswith('Maria realizou contrato de seguro'))
        for lixo in ('ORDEM DOS ADVOGADOS', 'Exame de Ordem Unificado', 'Página',
                     'ÁREA: DIREITO CIVIL', 'Aplicada em', 'Obs.:'):
            self.assertNotIn(lixo, e)

    def test_enunciado_para_antes_dos_itens(self):
        e = self.qs[1]['enunciado']
        self.assertTrue(e.endswith('Diante do caso narrado, responda aos itens a seguir.'))
        self.assertNotIn('A) O automóvel', e)

    def test_preserva_paragrafos_e_junta_linhas_quebradas(self):
        e = self.qs[1]['enunciado']
        self.assertIn('\nGuilherme solicitou ao Juízo a adjudicação do bem.\n', e)
        # "cobrando dívida no" / "valor de R$ 50.000,00" é UMA frase.
        self.assertIn('cobrando dívida no valor de R$ 50.000,00', e)

    def test_itens_com_pergunta_valor_e_gabarito(self):
        a, b = self.qs[1]['itens']
        self.assertEqual(a['letra'], 'A')
        self.assertEqual(a['pergunta'],
                         'O automóvel penhorado entra na comunhão de bens de Maria e '
                         'Fabiano? Justifique.')
        self.assertEqual(a['valor'], 0.6)
        self.assertTrue(a['gabarito'].startswith('Não. Tendo em vista'))
        self.assertIn('Art. 1.659, inciso I, do CC.', a['gabarito'])
        # O valor do B cai na linha de baixo no PDF.
        self.assertEqual(b['valor'], 0.65)
        self.assertNotIn('Valor', b['pergunta'])

    def test_gabarito_nao_invade_a_questao_seguinte(self):
        b = self.qs[1]['itens'][1]['gabarito']
        self.assertTrue(b.endswith('§6º, do CPC.'))
        self.assertNotIn('Maria realizou', b)

    def test_preliminar_nao_tem_distribuicao(self):
        # O gab44.txt é o "GABARITO PUBLICAÇÃO", anterior aos recursos.
        self.assertTrue(all('distribuicao' not in i for i in self.qs[1]['itens']))


class Padrao39(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.q = extrair(ler('padrao39_q1.txt'))[0]

    def test_cabecalho_curto_e_gabarito_com_ponto(self):
        self.assertEqual(self.q['numero'], 1)
        a, b = self.q['itens']
        self.assertTrue(a['gabarito'].startswith('Não. Maria não tem direito'))
        self.assertTrue(b['gabarito'].startswith('Sim. A ação de usucapião'))

    def test_distribuicao_sem_a_coluna_de_notas(self):
        a = self.q['itens'][0]['distribuicao']
        self.assertIn('animus domini', a)
        self.assertIn('(0,40)', a)          # o peso de cada trecho fica
        self.assertNotIn('0,00/0,15', a)    # a coluna de notas possíveis sai

    def test_distribuicao_nao_vaza_para_o_gabarito(self):
        self.assertNotIn('PONTUAÇÃO', self.q['itens'][1]['gabarito'])
        self.assertNotIn('(0,30)', self.q['itens'][1]['gabarito'])


class EnunciadoEmImagem(unittest.TestCase):
    def test_sem_caderno_o_enunciado_fica_vazio_e_a_validacao_barra(self):
        q = extrair(ler('padrao42_q1.txt'))[0]
        self.assertEqual(q['enunciado'], '')
        erros = validar([q])
        self.assertTrue(any('enunciado' in e for e in erros))

    def test_caderno_preenche_enunciado_e_itens(self):
        q = extrair(ler('padrao42_q1.txt'), ler('prova42_q1.txt'))[0]
        self.assertEqual(q['origem_enunciado'], 'prova')
        self.assertTrue(q['enunciado'].startswith('Amanda e Cristiano são pais de Ravi'))
        a, b = q['itens']
        self.assertEqual((a['valor'], b['valor']), (0.65, 0.6))
        self.assertIn('Os pais de Cristiano podem ser obrigados', a['pergunta'])
        # O gabarito continua vindo do padrão de resposta, não do caderno.
        self.assertTrue(a['gabarito'].startswith('Os avós podem ser obrigados'))
        # Subitens "A." e "B." da tabela, com o texto do definitivo.
        self.assertIn('de forma subsidiária (0,30)', a['distribuicao'])


class Validacao(unittest.TestCase):
    def base(self):
        item = lambda l: {'letra': l, 'pergunta': 'Pergunta de teste?', 'valor': 0.6,
                          'gabarito': 'Resposta de teste, Art. 1º.'}
        return [{'numero': n, 'enunciado': 'x' * 200, 'itens': [item('A'), item('B')]}
                for n in range(1, 5)]

    def test_exame_completo_passa(self):
        self.assertEqual(validar(self.base()), [])

    def test_aceita_item_c(self):
        qs = self.base()
        qs[0]['itens'].append(dict(qs[0]['itens'][0], letra='C'))
        self.assertEqual(validar(qs), [])

    def test_recusa_tres_questoes(self):
        self.assertTrue(validar(self.base()[:3]))

    def test_recusa_gabarito_vazio_e_valor_ausente(self):
        qs = self.base()
        qs[1]['itens'][0]['gabarito'] = ''
        qs[2]['itens'][1]['valor'] = None
        erros = validar(qs)
        self.assertTrue(any('2A: gabarito vazio' in e for e in erros))
        self.assertTrue(any('3B: valor' in e for e in erros))

    def test_recusa_so_item_a(self):
        qs = self.base()
        qs[3]['itens'] = qs[3]['itens'][:1]
        self.assertTrue(validar(qs))


class Limpeza(unittest.TestCase):
    def test_remove_rodape_do_caderno(self):
        linhas = linhas_limpas('QUESTÃO 1 – PÁGINA 8\n42o EXAME DO ORDEM UNIFICADO\n12\nTexto')
        self.assertEqual([l for l in linhas if l], ['Texto'])


if __name__ == '__main__':
    unittest.main()
