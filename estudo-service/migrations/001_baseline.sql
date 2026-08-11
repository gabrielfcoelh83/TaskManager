-- Baseline do estudo-service: registro de tentativas de questões.
--
-- Uma linha por tentativa, e não um JSON por questão como no localStorage
-- do front. Aninhado só serve quando tudo é lido de uma vez; achatado é o
-- que permite agrupar por dia e por disciplina sem carregar a base inteira.
CREATE TABLE IF NOT EXISTS tentativas (
  id            BIGSERIAL PRIMARY KEY,

  -- Vem sempre do JWT, nunca do corpo da requisição.
  user_id       INTEGER      NOT NULL,

  -- TEXT e não INTEGER: o mock usa id numérico, mas a geração por IA
  -- produz "q-1786108995123-a3f9xk2p1". Escolher INTEGER aqui garantiria
  -- uma migration dolorosa no dia em que a IA entrar.
  questao_id    TEXT         NOT NULL,

  correta       BOOLEAN      NOT NULL,

  -- Índice da alternativa marcada (0..n). Nulo quando a questão foi
  -- pulada — o front distingue "errou" de "não respondeu".
  alternativa   SMALLINT,

  -- Segundos gastos. Nulo quando o cronômetro não estava ativo.
  tempo_seg     INTEGER,

  respondida_em TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- A consulta que o front faz em toda abertura do dashboard é
-- "minhas tentativas desde X, mais recentes primeiro". Sem este índice
-- ela vira varredura da tabela inteira assim que houver volume.
CREATE INDEX IF NOT EXISTS idx_tentativas_user_data
  ON tentativas (user_id, respondida_em DESC);
