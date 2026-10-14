-- Simulado de prova real: um exame inteiro, as 80 questões, 5 horas.
--
-- O simulado do front sorteia questões e guarda o resultado no navegador.
-- Serve de treino, mas não mede evolução: duas provas sorteadas não são
-- comparáveis entre si, e o histórico some ao trocar de aparelho. Esta tabela
-- é o simulado que mede — prova real, registrada no servidor.
CREATE TABLE IF NOT EXISTS simulados (
  id            BIGSERIAL    PRIMARY KEY,

  -- Vem sempre do JWT, nunca do corpo da requisição.
  user_id       INTEGER      NOT NULL,

  exame         SMALLINT     NOT NULL CHECK (exame > 0),
  -- Tipo do caderno (1 a 4). Os tipos são a mesma prova embaralhada dentro
  -- de cada bloco; guardar o tipo serve para reabrir a mesma ordem.
  tipo          SMALLINT     NOT NULL CHECK (tipo BETWEEN 1 AND 4),

  -- Aqui o CHECK cabe, ao contrário de `tipo` e `motivo` nas tentativas:
  -- status não é rótulo de tela, é a máquina de estados que as rotas
  -- impõem, e um valor fora dela quebraria o índice parcial abaixo.
  status        TEXT         NOT NULL DEFAULT 'aberto'
                CHECK (status IN ('aberto', 'finalizado', 'abandonado')),

  -- Prova que a pessoa já tinha feito. A nota de quem lembra das questões
  -- não mede o mesmo que a primeira vez, e por isso sai da curva de
  -- evolução — mas o simulado continua permitido.
  refeito       BOOLEAN      NOT NULL DEFAULT FALSE,

  iniciado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  finalizado_em TIMESTAMPTZ,

  -- Gravados ao finalizar. Anulada vale ponto para todos, então a nota é
  -- acertos + anuladas, comparada ao corte de 40. Vêm do front porque
  -- gabarito e anulação moram no questoes_db (ver a rota de finalizar).
  acertos       SMALLINT     CHECK (acertos  BETWEEN 0 AND 80),
  anuladas      SMALLINT     CHECK (anuladas BETWEEN 0 AND 80),
  CHECK (acertos + anuladas <= 80)
);

-- Um simulado aberto por pessoa. É o banco que garante, e não a rota: dois
-- cliques em "Começar" chegam juntos, e um SELECT antes do INSERT deixaria
-- os dois passarem.
CREATE UNIQUE INDEX IF NOT EXISTS uq_simulados_um_aberto
  ON simulados (user_id) WHERE status = 'aberto';

CREATE INDEX IF NOT EXISTS idx_simulados_user_data
  ON simulados (user_id, iniciado_em DESC);

-- A tentativa respondida dentro do simulado aponta para ele. Nula para as
-- do quiz e do simulado sorteado, que continuam iguais. Aqui a FK é
-- possível: as duas tabelas estão no mesmo banco.
ALTER TABLE tentativas
  ADD COLUMN IF NOT EXISTS simulado_id BIGINT REFERENCES simulados (id);

CREATE INDEX IF NOT EXISTS idx_tentativas_simulado
  ON tentativas (simulado_id) WHERE simulado_id IS NOT NULL;
