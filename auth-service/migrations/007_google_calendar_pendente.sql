-- Conexão do Google Agenda em duas etapas. O callback do OAuth não grava mais
-- a conexão direto: guarda aqui uma pendência e devolve um código de uso único
-- ao front. Só quem está logado na conta dona da pendência confirma
-- (POST /calendar/google/confirm). Sem isso, alguém podia gerar a URL de
-- autorização da própria conta e fazer outra pessoa autorizar, ligando a
-- agenda da vítima à conta do atacante.
-- O código fica só como hash sha256; o refresh token, criptografado como em
-- google_calendar_connections. Pendência vale 10 minutos e é apagada ao uso.
CREATE TABLE IF NOT EXISTS google_calendar_pending_connections (
  id            BIGSERIAL PRIMARY KEY,
  codigo_hash   CHAR(64) NOT NULL UNIQUE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_pending_expires
  ON google_calendar_pending_connections (expires_at);
