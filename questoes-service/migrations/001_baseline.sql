-- Banco de questões do Exame de Ordem.
--
-- A tabela é dividida em duas metades com níveis de confiança diferentes, e
-- essa separação é a razão de o serviço existir:
--
--   FATO DA FGV     enunciado, alternativas, gabarito, anulada
--                   copiados da prova e do gabarito definitivo publicados.
--                   Ninguém — nem pessoa, nem modelo — decide isso.
--
--   ENRIQUECIMENTO  disciplina, tema, explicacao
--                   preenchidos depois, por IA ou por pessoa. Podem estar
--                   errados sem que isso torne a questão errada.
--
-- O banco de questões anterior era digitado à mão e tinha DOIS gabaritos
-- errados em trinta — um deles apontava uma pena que não existe no Código
-- Penal. Num app de estudo esse é o defeito mais caro possível, porque o
-- aluno memoriza com confiança justamente o que vai errar na prova. Colunas
-- separadas existem para que um enriquecimento ruim nunca possa virar isso.

CREATE TABLE questoes (
    id BIGSERIAL PRIMARY KEY,

    -- ── procedência ────────────────────────────────────────────────────
    -- Guardada por extenso, e não como texto solto tipo "OAB 45", porque é
    -- o que permite reimportar, conferir contra o PDF e localizar a questão
    -- na origem quando alguém contestar o gabarito.
    exame      SMALLINT NOT NULL,   -- 45 = 45º Exame de Ordem Unificado
    tipo_prova SMALLINT NOT NULL,   -- 1..4: mesma prova, ordens embaralhadas
    numero     SMALLINT NOT NULL,   -- 1..80 dentro daquele tipo
    banca      TEXT     NOT NULL DEFAULT 'FGV',
    ano        SMALLINT,

    -- ── fato da FGV ────────────────────────────────────────────────────
    enunciado    TEXT  NOT NULL,
    -- Array de textos, na ordem A, B, C, D. JSONB e não quatro colunas
    -- porque a ordem importa e porque um dia pode haver questão anulada
    -- com alternativa suprimida.
    alternativas JSONB NOT NULL,
    -- Índice 0..3 na lista acima. Índice, e não a letra, porque é assim que
    -- o front compara com o clique — guardar 'A' obrigaria a converter em
    -- todo lugar, e conversão espalhada é onde o gabarito se perde.
    gabarito     SMALLINT NOT NULL,

    -- A FGV anula questões a cada exame. Anulada continua servindo para
    -- estudo, mas não pode contar como erro de ninguém.
    anulada BOOLEAN NOT NULL DEFAULT FALSE,

    -- ── enriquecimento ─────────────────────────────────────────────────
    disciplina TEXT,
    tema       TEXT,
    explicacao TEXT,

    -- Quem escreveu a explicação. Sem isto, daqui a seis meses ninguém
    -- distingue o que uma pessoa conferiu do que um modelo escreveu às
    -- pressas — e a diferença é justamente o que decide se dá para confiar.
    explicacao_fonte TEXT CHECK (explicacao_fonte IN ('ia', 'humano')),

    -- Falso enquanto ninguém conferiu. A questão APARECE assim mesmo, com
    -- selo na tela: segurar 3.000 questões numa fila de revisão deixaria o
    -- app vazio até a fila acabar, e uma explicação não conferida ao lado
    -- de um gabarito oficial ainda ensina mais que questão nenhuma.
    revisada BOOLEAN NOT NULL DEFAULT FALSE,

    criada_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizada_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- O gabarito precisa existir dentro da lista de alternativas. Sem esta
    -- checagem, um erro de importação viraria uma questão sem resposta
    -- certa, que a tela mostraria como "você errou" para qualquer clique.
    CONSTRAINT gabarito_dentro_da_faixa
        CHECK (gabarito >= 0 AND gabarito < jsonb_array_length(alternativas)),

    -- A prova da OAB é sempre de quatro alternativas. Três ou cinco não é
    -- "quase certo" — é importação quebrada.
    CONSTRAINT quatro_alternativas
        CHECK (jsonb_array_length(alternativas) = 4),

    CONSTRAINT numero_valido    CHECK (numero     BETWEEN 1 AND 80),
    CONSTRAINT tipo_prova_valido CHECK (tipo_prova BETWEEN 1 AND 4),

    -- Reimportar o mesmo exame não pode duplicar. É o que torna a carga
    -- repetível: rodar de novo corrige, não acumula.
    CONSTRAINT questao_unica_na_prova UNIQUE (exame, tipo_prova, numero)
);

-- O filtro mais comum da tela é "questões desta disciplina". Sem índice,
-- cada abertura vira varredura completa — hoje irrelevante com um exame,
-- caro com quarenta.
CREATE INDEX idx_questoes_disciplina ON questoes (disciplina) WHERE disciplina IS NOT NULL;

-- Sorteio de quiz e simulado sempre exclui anuladas.
CREATE INDEX idx_questoes_validas ON questoes (exame, numero) WHERE anulada = FALSE;
