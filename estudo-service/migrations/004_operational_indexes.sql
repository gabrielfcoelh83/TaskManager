-- Consultas do dashboard filtram por usuário e ordenam por data.
CREATE INDEX IF NOT EXISTS idx_tentativas_user_questao_data
  ON tentativas (user_id, questao_id, respondida_em DESC);

CREATE INDEX IF NOT EXISTS idx_respostas_discursivas_user_questao_data
  ON respostas_discursivas (user_id, questao_id, criada_em DESC);
