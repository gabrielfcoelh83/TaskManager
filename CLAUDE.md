# CLAUDE.md

Guia para o Claude Code neste repositório. Cada app tem o próprio CLAUDE.md com o detalhe; este arquivo é o mapa e as regras que valem para os dois.

## Mapa

```
apps/web/   front (React 19 + Vite) e funções serverless em apps/web/api/ — Vercel, projeto ml-direito
apps/api/   backend de microserviços (Express + Postgres + Redis + nginx) — VPS Hostinger, api.mlkoab.tech
.github/workflows/
  api.yml      apps/api/**  → audit, testes, imagens no GHCR, deploy por SSH
  web.yml      apps/web/** ou apps/api/** → lint, test:lib, e2e contra o backend deste commit, build, deploy
  web-pr.yml   checagens extras de PR do front
docs/MIGRACAO-MONOREPO.md   como os dois repos viraram este, e como desfazer
```

Antes de mexer num app, leia o CLAUDE.md dele: [apps/web/CLAUDE.md](apps/web/CLAUDE.md), [apps/api/CLAUDE.md](apps/api/CLAUDE.md). Não há workspace npm na raiz: cada app (e cada serviço da API) tem o próprio `package.json` e `package-lock.json`.

## Os três ambientes

| | Front | API | Quem decide |
|---|---|---|---|
| **Local** | `npm run dev` em `apps/web` (:5173) | `docker compose up` em `apps/api` (gateway em :3000) | proxy do Vite manda `/api/*` para `localhost:3000`; `VITE_API_URL` **vazia** |
| **Preview** | deploy de Preview da Vercel (cada branch/PR) | **não existe API de preview** | `VITE_API_URL` do ambiente Preview na Vercel; sem ela, as funções `api/` caem em `localhost:3000` (falham, não tocam produção) |
| **Produção** | Vercel, `main` | VPS, `main` via `api.yml` | `VITE_API_URL=https://api.mlkoab.tech` em Production; `.env` da VM regerado a cada deploy |

Padrões de configuração apontam para **localhost**, nunca para produção: o compose de dev (`APP_BASE_URL`, `FRONTEND_BASE_URL`, `GOOGLE_CALENDAR_REDIRECT_URI`, `EMAIL_FROM=onboarding@resend.dev`) e `apps/web/api/_lib/auth.js` (só cai em `api.mlkoab.tech` com `VERCEL_ENV=production`). Produção só recebe valores reais pelos workflows e pela Vercel. Mantenha essa regra ao adicionar variável nova.

## Regra de ouro: API compatível para trás

Front e API estão no mesmo commit, **mas não sobem juntos**: a Vercel publica o front em segundos, o `api.yml` leva minutos (testes, imagens, SSH, smoke test) e pode fazer rollback sozinho. Durante essa janela — ou para sempre, se o deploy da API reprovar — o front novo conversa com a API velha, e o front velho (aba aberta, cache) com a API nova.

Por isso toda mudança de contrato em `apps/api` precisa funcionar com o front da versão anterior:

- Adicionar campo/rota: ok. Remover ou renomear: em dois passos — primeiro o front para de usar (deploy), depois a API remove (outro deploy).
- Campo novo obrigatório no corpo de um POST/PUT: não. Torne opcional com padrão no servidor.
- Migration destrutiva (DROP/RENAME de coluna) só depois que nenhuma versão no ar lê a coluna.
- Rota nova no gateway também precisa de linha no `server.proxy` do `apps/web/vite.config.js`, acima de `/api`.

O e2e do `web.yml` constrói a API do mesmo commit, então ele prova que **front novo + API nova** funcionam; ele **não** prova a compatibilidade com a versão anterior. Essa parte é disciplina de revisão.

## Commits

Mensagens em português, no padrão já usado (`feat(escopo): ...`, `fix(...)`, `chore(...)`, `docs(...)`, `ci(...)`). Prefira escopo do app quando a mudança é de um lado só (`feat(web): ...`, `fix(api/auth): ...`). Uma mudança que mexe nos dois lados vai num commit só — é para isso que o monorepo existe.
