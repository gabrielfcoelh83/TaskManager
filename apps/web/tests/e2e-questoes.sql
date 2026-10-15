-- Acervo mínimo para os testes e2e.
--
-- Não roda pelo entrypoint do Postgres como o `e2e-init.sql`: a tabela
-- `questoes` é criada pela migration do questoes-service, que só roda quando o
-- container sobe. Este arquivo é aplicado depois, pelo `e2e-backend.sh`.
--
-- Os exames 98 e 99 não existem — o mais recente é o 45º. É de propósito: se
-- este arquivo for apontado por engano para um banco com acervo de verdade,
-- ele não colide com nada e o estrago é uma linha a mais, não uma questão
-- oficial sobrescrita.
--
-- Dois exames, e não um, porque a barra lateral agrupa por exame enquanto as
-- questões não têm disciplina. Com um exame só, um agrupamento quebrado
-- passaria despercebido.
--
-- As alternativas são distintas entre as questões de propósito. Com o mesmo
-- texto em todas, um teste que tenta descobrir QUAL questão está na tela pela
-- lista de alternativas acha a primeira que casa — que pode ter outro
-- gabarito — e acusa erro de tradução onde não há.

INSERT INTO questoes
  (exame, tipo_prova, numero, banca, ano, enunciado, alternativas, gabarito, anulada, disciplina, tema, explicacao, explicacao_fonte, revisada)
VALUES
  (99, 1, 1, 'FGV', 2025,
   'Questão de teste 1: o gabarito oficial aponta a terceira alternativa.',
   '["q1 alternativa A","q1 alternativa B","q1 alternativa C","q1 alternativa D"]', 2,
   FALSE, NULL, NULL, NULL, NULL, FALSE),

  (99, 1, 2, 'FGV', 2025,
   'Questão de teste 2: o gabarito oficial aponta a primeira alternativa.',
   '["q2 alternativa A","q2 alternativa B","q2 alternativa C","q2 alternativa D"]', 0,
   FALSE, NULL, NULL, NULL, NULL, FALSE),

  -- Com explicação gerada por IA e não revisada: é o caso que a tela precisa
  -- etiquetar. Sem uma linha assim no acervo de teste, o aviso de "não
  -- revisada" nunca seria exercitado.
  (99, 1, 3, 'FGV', 2025,
   'Questão de teste 3: esta tem explicação, e a explicação não foi revisada.',
   '["q3 alternativa A","q3 alternativa B","q3 alternativa C","q3 alternativa D"]', 3,
   FALSE, NULL, NULL, 'Explicação de teste, gerada automaticamente.', 'ia', FALSE),

  (98, 1, 1, 'FGV', 2024,
   'Questão de teste 4: esta pertence a outro exame, para a barra ter dois grupos.',
   '["q4 alternativa A","q4 alternativa B","q4 alternativa C","q4 alternativa D"]', 1,
   FALSE, NULL, NULL, NULL, NULL, FALSE)

ON CONFLICT (exame, tipo_prova, numero) DO UPDATE SET
  enunciado    = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas,
  gabarito     = EXCLUDED.gabarito;
