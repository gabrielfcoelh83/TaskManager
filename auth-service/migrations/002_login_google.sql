-- Login com o Google.
--
-- Quem entra pelo Google não tem senha: `password_hash` deixa de ser
-- obrigatório. A conta do Google fica identificada por `google_sub`, o id
-- estável que o Google dá a cada pessoa — o e-mail pode mudar do lado de lá,
-- o `sub` não.
--
-- As duas mudanças só afrouxam o schema: o container anterior continua
-- funcionando com elas (cadastro com senha grava o hash como sempre), então
-- o rollback do deploy não quebra.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);

-- Única só entre quem tem: várias linhas com NULL (as contas de senha)
-- continuam valendo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
  ON users (google_sub) WHERE google_sub IS NOT NULL;
