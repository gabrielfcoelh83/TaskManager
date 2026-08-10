-- Baseline: reproduz o schema que o init.sql criava.
-- IF NOT EXISTS porque os bancos em produção já têm estas tabelas — esta
-- migration precisa ser inofensiva neles e criar tudo num banco vazio.
CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER UNIQUE NOT NULL,
  name         VARCHAR(255) NOT NULL,
  email        VARCHAR(255) NOT NULL,
  profile_data JSONB,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
