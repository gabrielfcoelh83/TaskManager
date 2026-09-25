-- Questões discursivas da 2ª fase (prova prático-profissional).
--
-- Tabela própria, e não linhas novas em `questoes`, porque quase nada é
-- comum: a objetiva tem quatro alternativas e um índice de gabarito, com
-- CHECKs que existem justamente para barrar qualquer coisa diferente disso. A
-- discursiva tem um caso, dois ou três itens com peso próprio e uma resposta
-- em texto. Encaixar uma na outra obrigaria a afrouxar as checagens que
-- protegem o acervo objetivo.
--
-- A filosofia do 001_baseline continua valendo, e aqui a tabela INTEIRA é
-- fato da FGV: enunciado, perguntas, valor de cada item e padrão de resposta
-- são copiados do "Padrão de Resposta" definitivo publicado pela banca. Nada
-- nesta tabela é escrito por pessoa ou modelo. Quando vier a correção por IA,
-- ela mora em outro lugar (as tentativas do aluno ficam no estudo-service) —
-- um comentário gerado nunca pode ser confundido com a resposta oficial.
--
-- A peça prático-profissional fica de fora nesta etapa.

CREATE TABLE IF NOT EXISTS questoes_discursivas (
    id BIGSERIAL PRIMARY KEY,

    -- ── procedência ────────────────────────────────────────────────────
    exame  SMALLINT NOT NULL,   -- 44 = 44º Exame de Ordem Unificado
    -- Área da 2ª fase escolhida pelo examinando. Texto curto e fixo, e não
    -- o rótulo da FGV ("DIREITO CIVIL"), porque é o que vai na URL da API.
    area   TEXT     NOT NULL,
    numero SMALLINT NOT NULL,   -- 1..4 dentro daquela área e exame

    -- ── fato da FGV ────────────────────────────────────────────────────
    -- O caso narrado, sem as perguntas.
    enunciado TEXT NOT NULL,
    -- [{letra, pergunta, valor, gabarito, distribuicao?}], em ordem.
    -- JSONB e não uma tabela de itens porque o item nunca é consultado
    -- sozinho: a tela sempre mostra a questão inteira. `distribuicao` é a
    -- tabela "Distribuição dos Pontos" do definitivo, quando existe.
    itens     JSONB NOT NULL,
    -- De qual publicação da FGV veio. É o que permite conferir contra o PDF
    -- quando alguém contestar um gabarito.
    fonte     TEXT,

    criada_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT discursiva_area_valida CHECK (area IN (
        'civil', 'penal', 'trabalho', 'administrativo',
        'constitucional', 'empresarial', 'tributario'
    )),
    CONSTRAINT discursiva_numero_valido CHECK (numero BETWEEN 1 AND 4),
    -- A FGV usa dois itens (A, B), às vezes três. Lista vazia é importação
    -- quebrada, e uma questão sem item não tem o que responder.
    CONSTRAINT discursiva_itens_validos CHECK (
        jsonb_typeof(itens) = 'array'
        AND jsonb_array_length(itens) BETWEEN 1 AND 5
    ),
    -- Reimportar o mesmo exame corrige em vez de duplicar.
    CONSTRAINT discursiva_unica UNIQUE (exame, area, numero)
);

-- A listagem da tela é "todas desta área, exame mais recente primeiro". O
-- UNIQUE acima já cobre (exame, area, numero), mas com `exame` na frente
-- não serve ao filtro por área.
CREATE INDEX IF NOT EXISTS idx_discursivas_area
    ON questoes_discursivas (area, exame DESC, numero);
