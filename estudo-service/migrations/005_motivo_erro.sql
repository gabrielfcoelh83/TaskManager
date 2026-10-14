-- Motivo do erro: a anotação do Caderno de Erros.
--
-- O caderno em si não precisa de tabela: é a aba "Errei" do front, calculada
-- pela última tentativa de cada questão. O que faltava era o porquê ("não
-- conhecia", "confundi", "li errado", "faltou tempo"), que é o que separa
-- lacuna de conteúdo de erro de atenção — e só o aluno sabe.
--
-- Fica na tentativa, e não numa tabela por questão, porque o motivo é daquele
-- erro: a mesma questão errada duas vezes pode ter dois motivos diferentes.
--
-- Anuláveis e sem CHECK, pelo mesmo raciocínio do `tipo` (002, ADR-001):
-- anotar é opcional, e o vocabulário de `motivo` é do produto — muda quando a
-- tela ganhar opção, e um CHECK aqui custaria uma migration por rótulo.
-- `motivo_nota` é o texto livre; o limite de tamanho é validado na rota.
ALTER TABLE tentativas ADD COLUMN IF NOT EXISTS motivo      TEXT;
ALTER TABLE tentativas ADD COLUMN IF NOT EXISTS motivo_nota TEXT;
