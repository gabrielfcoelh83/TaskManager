-- Login com o Google.
--
-- Quem entra pelo Google não tem senha: `password_hash` deixa de ser
-- obrigatório. A conta do Google fica identificada por `google_sub`, o id
-- estável que o Google dá a cada pessoa — o e-mail pode mudar do lado de lá,
-- o `sub` não.
--
-- As duas mudanças só afrouxam o schema: o container anterior sobe e segue
-- cadastrando e entrando por senha. Num rollback, porém, ele não conhece as
-- contas do Google: o `/login` antigo responde 500 para elas (hash nulo) e o
-- `/register` antigo, que diferencia maiúsculas, aceita `Foo@x` ao lado de um
-- `foo@x` criado pelo Google. Só acontece depois que o Google estiver
-- configurado.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);

-- Única só entre quem tem: várias linhas com NULL (as contas de senha)
-- continuam valendo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
  ON users (google_sub) WHERE google_sub IS NOT NULL;
