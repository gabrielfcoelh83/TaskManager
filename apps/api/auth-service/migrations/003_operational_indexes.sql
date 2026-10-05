-- Índice usado pelos fluxos de login e verificação de contas Google.
CREATE INDEX IF NOT EXISTS idx_users_email_lower
  ON users (lower(email));

CREATE INDEX IF NOT EXISTS idx_users_google_sub
  ON users (google_sub)
  WHERE google_sub IS NOT NULL;
