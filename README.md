# mlkoab

App de estudos para o Exame da OAB — [mlkoab.tech](https://mlkoab.tech).

Monorepo com o front e a API, unificados com o histórico dos dois repositórios de origem (MlDireito e TaskManager).

| Pasta | O quê | Onde roda |
|---|---|---|
| [`apps/web`](apps/web) | Front React 19 + Vite, e funções serverless (`apps/web/api/`: DataJud, IA com Gemini) | Vercel |
| [`apps/api`](apps/api) | Microserviços Node/Express (auth, user, estudo, questões, gateway) com Postgres, Redis e nginx | VPS — `api.mlkoab.tech` |

## Rodar localmente

```bash
# 1. API (exige Docker)
cd apps/api
cp .env.example .env          # preencha DB_PASSWORD e JWT_SECRET
docker compose up -d --build  # gateway em http://localhost:3000

# 2. Front
cd ../web
npm ci
npm run dev                   # http://localhost:5173 — VITE_API_URL vazia; o proxy do Vite fala com a 3000
```

Testes: `npm run ci` em `apps/web` (sem backend); `./scripts/e2e-backend.sh && npm run test:e2e` para o e2e, que constrói a API de `apps/api`. Os serviços da API têm testes próprios (`npm test` em cada pasta) — detalhes nos READMEs de cada app.

## Ambientes

- **Local**: tudo aponta para `localhost`. Nenhum padrão de configuração cai em produção.
- **Preview** (Vercel, por branch/PR): só o front. Não há API de preview; configure `VITE_API_URL` do ambiente Preview na Vercel conforme o que quiser testar.
- **Produção**: push na `main`. `web.yml` e a Vercel publicam o front; `api.yml` publica a API quando algo em `apps/api/**` muda.

Front e API não sobem ao mesmo tempo, então **toda mudança de API precisa ser compatível com o front anterior**. A regra completa está no [CLAUDE.md](CLAUDE.md).

## Mais

- [CLAUDE.md](CLAUDE.md) — mapa, ambientes, regra de compatibilidade
- [docs/MIGRACAO-MONOREPO.md](docs/MIGRACAO-MONOREPO.md) — como os dois repos viraram este
- [apps/web/README.md](apps/web/README.md), [apps/api/README.md](apps/api/README.md)
