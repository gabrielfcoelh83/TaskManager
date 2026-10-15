# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Leia antes de mexer

- **[src/ARCHITECTURE.md](src/ARCHITECTURE.md)** é a fonte de verdade da arquitetura (estado, sessão, dados da conta, API, pendências conhecidas). Atualize-o junto com mudanças de comportamento.
- **[DESIGN.md](DESIGN.md)** é o contrato visual ("Papel e tinta"). Toda UI nova segue ele.
- `project/` e `chats/` são os protótipos HTML e a conversa do Claude Design que originaram as telas: referência histórica, não código do app — não os edite nem os trate como fonte.
- O app usa **só questões reais OAB/FGV do acervo**; a IA não gera questão. Não existe `mockData.js` nem Next.js (`pages/api`) — se algum texto antigo disser o contrário, vale o ARCHITECTURE.md.

## Stack

React **19** + Vite 6, Tailwind v4 **sem preflight**, estilos majoritariamente por objeto inline (`buildStyles(theme)` em `src/lib/theme.js`). Sem React Router e sem lib de estado. Deploy do front e das funções `api/` na Vercel. Alias `@/` → `src/` (em `tsconfig.json`).

**TypeScript em migração gradual.** O código existente é `.js/.jsx` e não é checado (`allowJs`, `checkJs: false`); arquivo `.ts/.tsx` novo ou convertido é `strict` e passa por `npm run typecheck` e pelo `typescript-eslint`. TypeScript fica em `~6.0` porque o `typescript-eslint` ainda não aceita o 7. Ordem da migração: componentes e telas novas em `.tsx` já; `src/lib/` só depois de a CI (e a máquina local) irem para Node ≥ 22.18, porque os testes de lib importam `src/lib/*` direto no Node e o Node 20 não executa `.ts` (import com extensão `.ts`, `allowImportingTsExtensions` já ligado).

## Comandos

```bash
npm run dev            # Vite em :5173
npm run lint           # ESLint
npm run test:lib       # todo tests/*.test.js (menos api.test.js), cada um em UTC e America/Sao_Paulo
npm run typecheck      # tsc --noEmit (só os .ts/.tsx são checados)
npm run ci             # lint + typecheck + test:lib + build — a verificação local sem backend
node tests/quiz.test.js          # um teste de lib só (fuso da máquina, sem a 2ª rodada)
TZ=America/Sao_Paulo node tests/quiz.test.js

# E2E (Playwright, 1 worker, sobe o `npm run dev` sozinho) — exige o backend real:
./scripts/e2e-backend.sh         # constrói auth/user/estudo/questoes/gateway de ../api, sobe com postgres/redis e semeia
npm run test:e2e
npx playwright test -g "trecho do nome do teste"
./scripts/e2e-backend.sh down    # derruba e apaga volumes

# Testes das rotas api/ (precisam do backend acima + dev-api):
PORT=3100 VITE_API_URL=http://localhost:3000 node server/dev-api.js
npm run test:api
```

- Testes de lib são scripts Node puros (sem framework): acumulam falhas e saem com código ≠ 0. Arquivo novo em `tests/*.test.js` entra na CI automaticamente.
- Se a porta 3000 estiver ocupada, `GATEWAY_PORT=3300` vale para o script, o compose e o proxy do Vite.
- O `e2e-backend.sh` usa `jq` e Docker.

## Arquitetura em uma página

**Dois backends sob o mesmo prefixo `/api`:**
1. **Gateway da plataforma de microserviços** (`apps/api` neste monorepo): `/api/auth`, `/api/tentativas`, `/api/questoes`, `/api/users`, `/api/discursivas`, `/api/calendar` (Google Calendar do Cronograma; OAuth e tokens ficam no auth-service). Em produção via `VITE_API_URL` (absoluta); em dev pelo proxy do Vite para `localhost:3000`. Todo acesso passa por `src/lib/api/api.js` (`fetch`, erros viram `ApiError(message, status)`, `status 0` = rede/CORS, retentativa de 429).
2. **Funções serverless em `api/`** (Vercel): DataJud e a camada de IA (`api/_lib/ia.js`, Google Gemini no plano gratuito, só modelos "flash"). Em dev rodam pelo `server/dev-api.js` em `:3100`. Exigem login: `api/_lib/auth.js` valida o token no gateway — sem `VITE_API_URL` no processo, **só o deploy de produção (`VERCEL_ENV=production`) cai em `api.mlkoab.tech`**; Preview, dev-api e CI caem em `http://localhost:3000`.

**Rota nova do gateway precisa de linha própria no `server.proxy` do `vite.config.js`, acima de `/api`**; senão cai no dev-api e falha como se fosse bug de tela.

**Estado:** tudo em `App.jsx` (`state.screen` é a navegação; cada tela recebe sua fatia + setter de `updateSlice`). O estado é separado pela **origem do dado**:
- Interface → `state`, persistido em localStorage (`ma-questoes-state-v1`).
- Dados da conta sem rota na API (favoritos, anotações, histórico de simulado, rascunhos discursivos) → chave por conta `ma-questoes-conta-v1:<id>`.
- Dados do servidor (acervo, tentativas, perfil) → `useState` próprios, **nunca** em `state` nem localStorage.
- Gravações assíncronas conferem `sessaoEpoch` depois do `await`; PUTs de `profile_data` passam pela fila de preferências e mandam **só as chaves que mudaram** (o user-service mescla no 1º nível).

**Fases:** `state.fase` = `'objetiva'` (1ª fase, o app com menu) ou `'discursiva-civil'` (`SegundaFase.jsx`, layout próprio). Opções em `FASES` (`src/lib/navegacao.js`).

## Convenções

- Nomes de funções/variáveis em **português**, camelCase; componentes PascalCase; constantes UPPER_SNAKE_CASE.
- Lógica nova vai para `src/lib/` como função pura, com teste em `tests/`. Módulos que tocam `import.meta.env` (ex.: `lib/api/api.js`) não rodam no Node — extraia a parte testável para arquivo à parte (como `paginas.js`, `questions/acervo.js`).
- Comentários explicam o **porquê** (o bug que a linha evita), não o quê — padrão já denso no código; mantenha.
- Datas: pense em fuso local vs UTC; os testes rodam nos dois justamente por isso.
- Segredos (`GEMINI_API_KEY`, `VITE_GOOGLE_CLIENT_ID`) ficam em `.env.local` (gitignored); `.env.example` documenta cada variável.

## CI

Os workflows ficam na raiz do monorepo: `.github/workflows/web.yml` (roda com `working-directory: apps/web`): lint + test:lib → e2e (backend real via `e2e-backend.sh`, **construído de `apps/api` do mesmo commit**) + test:api → build → deploy Vercel (só push na `main`, se houver `VERCEL_TOKEN`; a CLI roda da raiz porque o projeto tem Root Directory `apps/web`). Dispara com mudança em `apps/web/**` ou `apps/api/**`. Um vermelho no e2e é deste commit; mudança de contrato na API tem de ser compatível para trás (ver o CLAUDE.md da raiz). No `web-pr.yml` o e2e tem `continue-on-error`; quem barra o PR é o `web.yml`.
