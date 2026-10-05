-- Contas antigas permanecem ativas estruturalmente, mas o auth-service exige
-- email_verified_at antes de emitir novas sessões.
CREATE INDEX IF NOT EXISTS idx_users_email_verification
  ON users (id)
  WHERE email_verified_at IS NULL;
