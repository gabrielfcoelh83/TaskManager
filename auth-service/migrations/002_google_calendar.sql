CREATE TABLE IF NOT EXISTS google_calendar_connections (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  calendar_id   TEXT NOT NULL DEFAULT 'primary',
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
