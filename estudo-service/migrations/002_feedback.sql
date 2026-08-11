-- Feedback metacognitivo: como a pessoa chegou na resposta.
--
-- O app já pergunta isso depois de cada questão ("Tinha certeza absoluta",
-- "Foi chute"...) e vinha jogando a resposta fora ao trocar de sessão. É o
-- dado que separa acertar sabendo de acertar por sorte — sem ele a taxa de
-- acerto é otimista de um jeito que não dá para detectar depois.

-- Anuláveis de propósito: a tentativa nasce sem feedback (é gravada no
-- instante em que a alternativa é marcada) e pode morrer sem ele, porque
-- pular a pergunta é um caminho legítimo. Um NOT NULL DEFAULT aqui mentiria
-- sobre "não respondeu", que é exatamente o erro que a coluna `correta`
-- evita ao recusar ausência em vez de assumir false.
ALTER TABLE tentativas ADD COLUMN IF NOT EXISTS tipo    TEXT;
ALTER TABLE tentativas ADD COLUMN IF NOT EXISTS certeza SMALLINT;

-- A faixa é a única regra que vale a pena prender no schema: `certeza` é
-- percentual, e um -3 gravado hoje é uma consulta errada para sempre. Já o
-- vocabulário de `tipo` ("chute", "acerto-conceitual", ...) fica de fora de
-- propósito — ele é do produto e muda quando a tela de feedback ganhar
-- opção. Um CHECK ali significaria uma migration por mudança de rótulo.
-- Ver ADR-001 em /shared/context/adr/.
ALTER TABLE tentativas DROP CONSTRAINT IF EXISTS certeza_percentual;
ALTER TABLE tentativas ADD CONSTRAINT certeza_percentual
  CHECK (certeza IS NULL OR (certeza >= 0 AND certeza <= 100));
