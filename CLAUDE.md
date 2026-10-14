# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visão geral

Backend de microserviços de uma plataforma de estudo para o Exame de Ordem (OAB). O front fica em outro repositório (MlDireito, Vite, servido pela Vercel). Produção: `https://api.mlkoab.tech`, numa VPS com ~1 GB de RAM.

Stack real (não é a stack padrão do usuário): Node 22 + **Express 4** + **`pg` puro, sem ORM** (SQL escrito à mão), Redis 7, PostgreSQL 15, Nginx, Jest + Supertest. Scripts auxiliares de importação em Python (`questoes-service/importador/`).

`docs/ARCHITECTURE.md` traz o detalhe de domínio (disciplina/tema, explicações por IA, discursivas, carga do acervo). Não existe código compartilhado entre serviços: cada um tem o próprio `verifyToken` em `app.js`.

## Comandos

```bash
docker compose up --build              # stack local (exige DB_PASSWORD, JWT_SECRET, RESEND_API_KEY no .env)
curl http://localhost:3000/health/services   # 200 mesmo com serviço DOWN — leia o corpo
docker compose logs -f <serviço>
docker compose exec postgres psql -U postgres auth_db
```

`docker-compose.override.yml` (local, não versionado) põe `NODE_ENV=test` no auth-service, o que **pula a confirmação de e-mail** no cadastro.

Testes — por serviço, sem runner na raiz:

```bash
cd <serviço> && npm ci && npm test                 # jest --runInBand --forceExit
npx jest tests/auth.test.js -t "rejeita email duplicado"   # um teste só
```

Os testes de auth/user/estudo/questoes são de **integração contra Postgres e Redis reais** (sem mocks, de propósito) e rodam as migrations no `beforeAll`. Precisam do banco criado por `init.sql` e das variáveis usadas no CI:

```
DB_HOST=localhost DB_PORT=5432 DB_NAME=<auth_db|user_db|estudo_db|questoes_db> DB_USER=postgres DB_PASSWORD=...
JWT_SECRET=<32+ caracteres> NODE_ENV=test RESEND_API_KEY=test-placeholder REDIS_URL=redis://localhost:6379
```

No `docker-compose.yml` (dev), toda porta publicada é `127.0.0.1:` (nginx 80/443/3000, serviços 3001–3005): sem o prefixo o Docker publica em 0.0.0.0 por fora do firewall. Porta nova em dev segue o mesmo padrão; o compose de produção publica só 80/443. Postgres e Redis não publicam porta; para rodar testes fora do container suba um Postgres/Redis com porta exposta. Os testes do gateway (`gateway/gateway.test.js`) substituem o adapter do axios e não precisam de banco. `questoes-service/tests/importador_discursivas.test.js` chama os `unittest` Python via `python3`: sem Python é pulado localmente, mas falha no CI.

## Arquitetura

```
cliente → nginx (TLS, CORS, rate limit) → api-gateway :3000 → auth :3001 / user :3002 / estudo :3004 / questoes :3005
                                                                   └── um banco por serviço na mesma instância Postgres
```

- **Database-per-service**: `auth_db`, `user_db`, `estudo_db`, `questoes_db`. Nada de JOIN ou FK entre bancos (ex.: `estudo_db.respostas_discursivas.questao_id` não tem FK). Serviços só se falam por HTTP ou Redis.
- **Estrutura de cada serviço**: `app.js` exporta `{ app, pool, ... }` sem dar `listen` (é o que os testes importam); `index.js` roda `migrate(pool)` e só depois `listen`. Falha de migration mata o processo — isso é intencional, para o smoke test do deploy reprovar.
- **Migrations**: `migrations/NNN_nome.sql`, aplicadas em ordem lexicográfica, cada uma numa transação, registradas em `schema_migrations` (pelo nome do arquivo), sob `pg_advisory_lock`. Para mudar schema, crie um arquivo novo — nunca edite um já aplicado. `init.sql` só cria os bancos e roda uma única vez, na criação do volume.
- **Autenticação**: o auth-service emite JWT com payload `{ id, email }`, válido por 7 dias e sem denylist (`JWT_SECRET` compartilhado); o dono do recurso é `req.user.id`. Os outros serviços validam a assinatura localmente com `jwt.verify` no próprio `verifyToken`. O gateway não valida token, só repassa `Authorization`. user-service tem `requireOwnership` e `requireAdmin` (`ADMIN_USER_IDS`).
- **Gateway** (`gateway/index.js`): uma rota explícita por endpoint, prefixo `/api/...` → rota sem prefixo no serviço. Endpoint novo num serviço precisa de rota nova aqui (e a ordem importa: `/api/discursivas/respostas` antes de `/:id`). Chamadas passam por `downstream()` com circuit breaker por serviço, timeout de 5 s e **sem retry** (para não duplicar POST/PUT/PATCH). Propaga `X-Request-ID`.
- **CORS mora só no nginx** (`nginx/conf.d/default.conf` + `nginx/snippets/proxy.conf`). Não adicione `cors()` no gateway: cabeçalho duplicado faz o navegador recusar a resposta, e o smoke test reprova o deploy.
- **Eventos**: auth-service faz `XADD` em `user-events` (Redis Stream, `MAXLEN ~10000`) no cadastro; user-service consome com consumer group (`XREADGROUP` + `XACK`) e cria o perfil. estudo e questoes não usam Redis.
- **auth-service** também concentra: confirmação de e-mail e reset de senha via Resend (`email.js`; tokens guardados só como hash SHA-256), login com Google (`POST /google`, 503 sem `GOOGLE_CLIENT_ID`) e integração com Google Calendar (`google-calendar.js`; refresh token criptografado com `GOOGLE_TOKEN_ENCRYPTION_KEY`).
- **questoes-service**: o acervo não sobe com o deploy. Carga manual via `importador/*.py` → `carregar.js` / `carregar_discursivas.js`, enriquecimento por IA via `classificar.js` / `explicar.js` (só Gemini, `GEMINI_API_KEY` do plano gratuito do AI Studio; a explicação só é gravada depois de conferida por um segundo modelo, de preferência de outra família e nunca o próprio autor). Campos `*_fonte` (`'prova'`, `'ia'`, `'humano'`): `'humano'` nunca pode ser sobrescrito por script. Detalhes em `docs/ARCHITECTURE.md`.

## Deploy e produção

`.github/workflows/ci-cd.yml`: `npm audit --omit=dev` → testes (matriz por serviço) → build e push para GHCR com tag `${sha}` → deploy por SSH para `/srv/projects/TaskManager` usando `docker-compose.prod.yml` (`name: taskmanager` fixo, para não trocar o volume do banco). O `.env` da VM é regerado a cada deploy a partir dos secrets/vars do GitHub. As quatro `GOOGLE_*` são obrigatórias em produção: o passo "Validar variáveis do Google" reprova o deploy sem elas, ou com a redirect URI diferente de `${APP_BASE_URL}/api/calendar/google/callback` (o código continua tolerante e responde 503; quem exige é o deploy). O smoke test confere nginx/TLS, `/health/services` sem `DOWN`, se todos os containers rodam a tag nova e se há exatamente um `Access-Control-Allow-Origin` correto; só então grava `.last_good_tag`, usado pelo rollback automático.

Ao adicionar um serviço novo, é preciso mexer em: `init.sql`, os dois composes, `scripts/backup.sh` (`BANCOS`), as listas de serviços do workflow (audit, test, build, smoke test) e o gateway. Esquecer o backup falha em silêncio.

Os comentários do código e do workflow explicam incidentes reais (bind mount de arquivo prendendo o inode, `exec -T` engolindo a stdin do script, porta 8080 exposta furando o UFW). Leia antes de "simplificar" essas partes.

Backups: container `backup` faz dump diário em `backups/` (retenção de 7 dias). Para verificar um dump sem tocar nos bancos: `docker compose -f docker-compose.prod.yml exec -T backup sh /scripts/verify-backup.sh /backups/<db>-<ts>.sql.gz`. Só funciona com o compose de produção: o de dev monta apenas `backup.sh` (em `/backup.sh`), não a pasta `scripts/`.
