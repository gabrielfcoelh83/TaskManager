-- user_id já é UNIQUE, mas o índice parcial evita varredura ao procurar
-- perfis que ainda não receberam o evento de cadastro.
CREATE INDEX IF NOT EXISTS idx_users_user_id
  ON users (user_id);
