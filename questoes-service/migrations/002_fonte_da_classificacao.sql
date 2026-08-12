-- De onde veio a disciplina da questão.
--
-- A tabela já registrava quem escreveu a EXPLICAÇÃO (`explicacao_fonte`), mas
-- não quem escolheu a disciplina e o tema. Enquanto ninguém classificava, isso
-- não fazia diferença: as colunas estavam vazias. Passa a fazer agora, porque
-- a classificação é feita por um modelo.
--
-- Por que não bastava o `revisada`: ele é UM booleano para a linha inteira. No
-- dia em que alguém revisar a explicação de uma questão e marcar revisada, a
-- disciplina escolhida pelo modelo é abençoada junto — sem que essa pessoa
-- necessariamente tenha olhado para ela. Uma coluna separada mantém as duas
-- afirmações independentes, que é o mesmo motivo pelo qual `explicacao_fonte`
-- existe.
--
-- Sem DO $$ ... $$ com IF NOT EXISTS aqui porque ADD COLUMN IF NOT EXISTS já
-- é idempotente sozinho. E sem BEGIN/COMMIT: o migrate.js roda cada arquivo
-- dentro da própria transação, e abrir outra aqui quebraria o controle dele.

ALTER TABLE questoes
    ADD COLUMN IF NOT EXISTS disciplina_fonte TEXT;

-- A checagem vem separada do ADD COLUMN para o arquivo poder rodar de novo
-- numa base onde a coluna já exista sem a constraint.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'disciplina_fonte_valida'
    ) THEN
        ALTER TABLE questoes
            ADD CONSTRAINT disciplina_fonte_valida
            CHECK (disciplina_fonte IN ('ia', 'humano'));
    END IF;
END $$;

-- Consulta de trabalho da classificação: "o que ainda não foi classificado".
-- Sem índice ela varre a tabela inteira a cada lote, e a tabela só cresce.
CREATE INDEX IF NOT EXISTS questoes_sem_disciplina
    ON questoes (exame) WHERE disciplina IS NULL;
