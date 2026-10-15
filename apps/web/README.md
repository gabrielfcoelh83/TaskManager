# MA Questões

Front-end de estudo para o Exame da OAB: questões reais da 1ª fase (OAB/FGV),
simulados, revisões, cronograma semanal (com envio opcional ao Google
Calendar) e a 2ª fase de Direito Civil com conferência de fundamentos.

SPA em React 19 + Vite (TypeScript entrando aos poucos), publicada na Vercel. Os dados vêm do gateway da
plataforma de microserviços (repo **TaskManager**), mais algumas funções
serverless em `api/` (DataJud e a camada de IA).

## Rodar em desenvolvimento

Requisitos: Node 20+, Docker (para o backend) e `jq`.

```bash
npm ci

# 1. Backend: o mesmo que a CI usa. Sobe postgres, redis, auth, user, estudo,
#    questoes e gateway (porta 3000), semeia o acervo e cria o usuário de teste
#    maria.lais@email.com / senha-de-teste-123
export E2E_JWT_SECRET=$(openssl rand -hex 32)
./scripts/e2e-backend.sh
#    (alternativa: `docker compose up -d` em `../api`)

# 2. Funções de api/ (opcional; só DataJud/IA). Fica fora da 3000, que é do gateway
PORT=3100 VITE_API_URL=http://localhost:3000 node server/dev-api.js

# 3. Front em http://localhost:5173
npm run dev
```

Em dev, `VITE_API_URL` fica vazia: o proxy do `vite.config.js` manda as rotas
do gateway para a porta 3000 e o resto de `/api` para o dev-api na 3100. Se a
3000 estiver ocupada, `GATEWAY_PORT=3300` vale para o script, o compose e o
proxy. Cada variável de ambiente está explicada em [.env.example](.env.example);
segredos (`GEMINI_API_KEY`, `VITE_GOOGLE_CLIENT_ID`) vão em `.env.local`.

## Testes

| Comando | O que roda |
|---|---|
| `npm run ci` | lint + testes de lib + build (sem backend) |
| `npm run test:lib` | todo `tests/*.test.js` (menos `api.test.js`), em UTC e America/Sao_Paulo |
| `npm run test:e2e` | Playwright contra o backend do passo 1 |
| `npm run test:api` | rotas de `api/` (backend + dev-api no ar) |

Para derrubar o backend e limpar os volumes: `./scripts/e2e-backend.sh down`.

## Deploy

Push na `main` roda `.github/workflows/web.yml` (na raiz do monorepo) (lint → testes de lib → e2e →
build) e publica na Vercel quando o `VERCEL_TOKEN` está configurado. Em
produção, `VITE_API_URL` precisa estar nas variáveis do projeto na Vercel.

## Documentação

- [src/ARCHITECTURE.md](src/ARCHITECTURE.md): estado, sessão, API, fases e pendências conhecidas.
- [DESIGN.md](DESIGN.md): linguagem visual ("Papel e tinta").
- [CLAUDE.md](CLAUDE.md): guia para agentes de código.

`project/` e `chats/` guardam os protótipos HTML e a conversa do Claude
Design que deram origem às telas. São referência histórica, não código do app.
