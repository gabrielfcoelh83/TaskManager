-- Filtros mais frequentes do acervo e das discursivas.
CREATE INDEX IF NOT EXISTS idx_questoes_exame_disciplina_validas
  ON questoes (exame, disciplina, numero)
  WHERE anulada = FALSE;

CREATE INDEX IF NOT EXISTS idx_questoes_discursivas_area_exame
  ON questoes_discursivas (area, exame, numero);
