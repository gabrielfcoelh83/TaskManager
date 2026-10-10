-- Qual modelo ESCREVEU a explicação gerada por IA.
--
-- O explicar.js passou a conferir cada explicação com um segundo modelo,
-- diferente do que a escreveu. Na geração isso é fácil: o gerador acabou de
-- responder. Já o `--conferir-gravadas`, que reconfere textos gravados antes,
-- não tinha como saber o autor — e um modelo conferindo o próprio texto tende
-- a aprovar o próprio erro. Com a coluna, o autor de cada linha é excluído da
-- conferência automaticamente.
--
-- Só faz sentido com `explicacao_fonte = 'ia'`; fica NULL para 'humano' e para
-- as gravadas antes desta migration (para essas, o explicar.js exige
-- `--excluir <modelo>` ou IA_MODELOS explícito). O UPDATE que limpa uma
-- explicação reprovada limpa esta coluna junto.
--
-- Nullable e sem default: o container antigo, que não conhece a coluna, segue
-- funcionando durante o deploy e no rollback. Sem BEGIN/COMMIT: o migrate.js
-- já roda cada arquivo na própria transação.

ALTER TABLE questoes
    ADD COLUMN IF NOT EXISTS explicacao_modelo TEXT;
