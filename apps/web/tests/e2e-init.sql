-- Bancos que os serviços esperam encontrar já criados.
--
-- Cada serviço aplica o próprio schema no arranque (migrate.js); o que ele
-- não faz é criar o banco. Este arquivo roda pelo entrypoint do Postgres, que
-- só o executa quando o diretório de dados nasce vazio — no CI isso é sempre,
-- porque o container é novo a cada execução.
--
-- Vale saber que na VM de produção essa mesma condição é falsa: o volume já
-- existe há muito tempo, e lá o banco precisou ser criado à mão.
CREATE DATABASE auth_db;
CREATE DATABASE estudo_db;
