-- Baseline: reproduz o schema que o init.sql criava.
-- IF NOT EXISTS porque os bancos em produção já têm estas tabelas — esta
-- migration precisa ser inofensiva neles e criar tudo num banco vazio.
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
