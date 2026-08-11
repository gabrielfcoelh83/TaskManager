-- Só a criação dos bancos. O schema de cada um é responsabilidade do
-- serviço que o possui, aplicado por migrations no arranque.
--
-- Este arquivo roda uma única vez, quando o volume do Postgres é criado.
-- Era exatamente essa limitação que tornava impossível evoluir o schema.
CREATE DATABASE auth_db;
CREATE DATABASE user_db;
CREATE DATABASE task_db;
CREATE DATABASE estudo_db;
