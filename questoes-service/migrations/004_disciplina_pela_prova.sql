-- A disciplina das objetivas passa a vir da prova, e o tema ganha fonte própria.
--
-- ── disciplina_fonte = 'prova' ─────────────────────────────────────────
-- A FGV organiza a 1ª fase em blocos fixos por disciplina (Ética de 1 a 8,
-- Filosofia 9 e 10, e assim por diante), então a disciplina de uma questão é
-- a posição dela no caderno. A tabela de blocos mora em disciplinas.js.
--
-- O nome é 'prova', e não 'posicao' ou 'tabela', porque a coluna responde
-- "quem decidiu", como 'ia' e 'humano': quem decide aqui é a banca, pela forma
-- como montou a prova. A posição é só o meio de ler essa decisão. E a
-- distinção importa na hora de confiar: 'prova' está no mesmo nível do
-- gabarito (desde que a tabela do exame tenha sido conferida), 'ia' é palpite
-- de modelo, 'humano' é alguém que olhou.
--
-- ── tema_fonte ─────────────────────────────────────────────────────────
-- A 002 criou `disciplina_fonte` para dizer quem escolheu "a disciplina e o
-- tema" — na época, sempre o mesmo modelo, na mesma resposta. Agora não: a
-- disciplina vem da prova e o tema continua vindo da IA. Com uma coluna só,
-- trocar a fonte da disciplina para 'prova' apagaria o registro de que o tema
-- ao lado foi escrito por um modelo — o mesmo problema que motivou a 002, uma
-- afirmação abençoando a outra sem ninguém ter olhado.
--
-- Sem BEGIN/COMMIT: o migrate.js já roda cada arquivo na própria transação.

-- DROP + ADD em vez de ALTER: o Postgres não altera CHECK no lugar. IF EXISTS
-- deixa o arquivo rodar numa base onde a 002 criou a coluna sem a constraint.
ALTER TABLE questoes DROP CONSTRAINT IF EXISTS disciplina_fonte_valida;
ALTER TABLE questoes
    ADD CONSTRAINT disciplina_fonte_valida
    CHECK (disciplina_fonte IN ('ia', 'humano', 'prova'));

-- 'prova' não entra aqui: a banca não dá tema, só disciplina.
ALTER TABLE questoes
    ADD COLUMN IF NOT EXISTS tema_fonte TEXT
    CONSTRAINT tema_fonte_valida CHECK (tema_fonte IN ('ia', 'humano'));

-- Até aqui, todo tema foi escrito junto com a disciplina e pela mesma fonte.
-- Copiar agora é o que preserva essa informação antes de o backfill por
-- posição (aplicar_disciplina_posicao.js) trocar `disciplina_fonte`.
UPDATE questoes
   SET tema_fonte = disciplina_fonte
 WHERE tema IS NOT NULL
   AND tema_fonte IS NULL
   AND disciplina_fonte IN ('ia', 'humano');

-- A fila da classificação deixou de ser "sem disciplina" e passou a ser "sem
-- tema": questão com disciplina da prova ainda precisa do tema da IA. O
-- índice da 002 continua útil para quem procura o que não tem disciplina.
CREATE INDEX IF NOT EXISTS questoes_sem_tema
    ON questoes (exame) WHERE tema IS NULL;
