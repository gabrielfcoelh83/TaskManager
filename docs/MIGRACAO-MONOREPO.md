# Migração para o monorepo

Outubro de 2026. Os repositórios `MlDireito` (front) e `TaskManager` (API) viraram um só, porque separar local de produção e manter as versões alinhadas entre dois repos estava custando bugs: o e2e do front testava contra a imagem `:latest` da API, e um vermelho podia vir do outro repo.

## Decisões

- **O repo `TaskManager` virou o monorepo** (depois renomeado para `mlkoab`). Ele já tinha os secrets e vars do ambiente `production`, as imagens no GHCR (`ghcr.io/gabrielfcoelh83/microservices-*`) e a chave SSH do deploy; mover a API para outro repo exigiria recriar tudo isso. O `MlDireito` foi arquivado.
- **Histórico preservado** com `git filter-repo --to-subdirectory-filter`: cada commit do MlDireito aparece com os arquivos em `apps/web/`, cada commit do TaskManager em `apps/api/`. Autores, datas e mensagens originais intactos. Os dois históricos se juntam num merge sem ancestral comum. Só a `main` de cada repo foi importada; os branches antigos do MlDireito continuam no repo arquivado.
- **Commits novos da migração** são do autor `Claude <noreply@anthropic.com>`.
- **Caminho na VM não mudou**: o deploy continua em `/srv/projects/TaskManager` com `name: taskmanager` no compose de produção. Trocar o diretório significaria mover `.env`, certificados, backups e o volume do Postgres — risco sem ganho.
- **Imagens do GHCR com o mesmo nome**: `microservices-<serviço>`. O dono do pacote é o usuário, não o repo, então renomear o repo não as afeta.

## O que mudou no código

| Antes | Depois |
|---|---|
| `TaskManager/.github/workflows/ci-cd.yml` | `.github/workflows/api.yml`, com `paths: apps/api/**` e `defaults.run.working-directory: apps/api`; contexto do Docker, cache do npm, escopo do cache do buildx (`api-<serviço>`) e artefato (`api-audit-reports`) com prefixo |
| `paths-ignore` sob `workflow_dispatch` (sem efeito) | removido; disparo manual roda sempre |
| `MlDireito/.github/workflows/ci.yml` e `pr.yml` | `web.yml` e `web-pr.yml`, disparando com `apps/web/**` **ou** `apps/api/**`; `working-directory: apps/web`; o deploy pela CLI da Vercel roda da raiz |
| e2e do front com `ghcr.io/...:latest` e `docker compose pull` | `build: ../api/<serviço>` e `docker compose build` — testa a API do mesmo commit |
| `apps/web/api/_lib/auth.js` caía em `api.mlkoab.tech` sem `VITE_API_URL` | só cai lá com `VERCEL_ENV=production`; senão `http://localhost:3000` |
| compose de dev da API com padrões de produção | padrões de localhost (`APP_BASE_URL`, `FRONTEND_BASE_URL`, `GOOGLE_CALENDAR_REDIRECT_URI`) e `EMAIL_FROM=onboarding@resend.dev`; `apps/api/.env.example` novo |

## Configuração fora do código

- **Vercel (projeto `ml-direito`)**: Git conectado ao repo do monorepo, Root Directory `apps/web`. `VITE_API_URL` em Production = `https://api.mlkoab.tech`.
- **Deploy do front**: a integração Git da Vercel publica sozinha. O job `deploy` do `web.yml` só roda se houver `VERCEL_TOKEN` nos secrets do repo — e esse secret ficou no MlDireito, não foi copiado. Na prática, quem publica é a integração. Se um dia o secret for adicionado aqui, desligue um dos dois, senão a produção recebe dois deploys por push.
- **Skills do Claude Code** do front estão em `apps/web/.claude/skills/`; o Claude Code as carrega quando o trabalho é dentro de `apps/web`.

## Como desfazer

O `main` do TaskManager antes do corte está preservado:

- branch **`legado/main`** no remoto, apontando para `46d20a8`;
- tag anotada **`legado/main`** criada localmente no mesmo commit. O proxy da sessão que fez a migração recusou o push de tags; para publicá-la: `git push origin refs/tags/legado/main`. Branch e tag com o mesmo nome confundem o git em alguns comandos — depois de enviar a tag, apague o branch (`git push origin :refs/heads/legado/main`) ou use sempre o nome completo (`refs/tags/legado/main`).

Para voltar ao estado anterior: force-push de `legado/main` para `main`, Vercel de volta ao repo MlDireito (desarquivar) com Root Directory vazio. A VM não precisa de nada: o deploy anterior continua lá, e `.last_good_tag` aponta para a última imagem boa.
