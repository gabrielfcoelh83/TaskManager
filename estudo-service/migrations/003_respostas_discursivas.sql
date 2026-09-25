-- Respostas escritas pela pessoa às questões discursivas da 2ª fase.
--
-- Uma linha por envio, e não uma por (pessoa, questão) sobrescrita: refazer
-- a mesma questão semanas depois e comparar com a tentativa anterior é o
-- jeito de estudar para a 2ª fase, e sobrescrever apagaria justamente isso.
--
-- Sem FK para a questão: ela mora em questoes_db, outro banco. A integridade
-- entre os dois é do mesmo tipo da `tentativas.questao_id` — por convenção.
-- Uma resposta para questão que deixou de existir continua sendo o que a
-- pessoa escreveu, e não há motivo para apagá-la.
--
-- A correção por IA fica para depois. Quando vier, entra como colunas
-- anuláveis nesta tabela (ou tabela própria), sem mexer no que já existe.
CREATE TABLE IF NOT EXISTS respostas_discursivas (
  id          BIGSERIAL   PRIMARY KEY,

  -- Vem sempre do JWT, nunca do corpo da requisição.
  user_id     INTEGER     NOT NULL,

  -- id de questoes_discursivas, no questoes-service.
  questao_id  BIGINT      NOT NULL,

  -- {"A": "texto", "B": "texto"} — a chave é a letra do item. Objeto e não
  -- lista para que um item deixado em branco não desloque os outros.
  respostas   JSONB       NOT NULL,

  -- {"citados": n, "esperados": m}: quantos dos fundamentos legais do
  -- padrão de resposta a pessoa marcou como citados. Opcional — é
  -- autoavaliação da tela, não correção.
  fundamentos JSONB,

  criada_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT respostas_e_objeto CHECK (jsonb_typeof(respostas) = 'object'),
  CONSTRAINT fundamentos_e_objeto
    CHECK (fundamentos IS NULL OR jsonb_typeof(fundamentos) = 'object')
);

-- A consulta da tela é "minhas respostas a esta questão, mais recente
-- primeiro" — e, sem questão, "minhas respostas". O índice serve às duas
-- pelo prefixo user_id.
CREATE INDEX IF NOT EXISTS idx_respostas_discursivas_user_questao
  ON respostas_discursivas (user_id, questao_id, criada_em DESC);
