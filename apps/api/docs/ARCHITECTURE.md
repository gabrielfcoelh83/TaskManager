# Arquitetura do Backend - TaskManager

## 🏗️ Visão Geral

Plataforma de microserviços para educação jurídica (preparação OAB/Magistratura).

**Stack:** Node.js + Express + PostgreSQL + Redis + Nginx

---

## 📊 Serviços

| Serviço | Porta | DB | Responsabilidade |
|---------|-------|-----|------------------|
| **API Gateway** | 3000 | - | Roteamento único (Express) |
| **Auth Service** | 3001 | `auth_db` | Registro, login, JWT |
| **User Service** | 3002 | `user_db` | Perfis de usuário |
| **Estudo Service** | 3004 | `estudo_db` | Tentativas de questões e respostas às discursivas |
| **Questões Service** | 3005 | `questoes_db` | Questões do Exame de Ordem (objetivas e discursivas da 2ª fase) |

---

## 📁 Estrutura de Pastas

```
TaskManager/
├── shared/                      # (NOVO) Código compartilhado
│   ├── middleware/
│   │   ├── auth.js             # verifyToken (CENTRALIZADO)
│   │   └── errorHandler.js     # Tratamento de erro unificado
│   ├── validators/             # (Vazio por agora)
│   │   ├── user.js
│   │   └── question.js
│   ├── utils/
│   │   ├── db.js               # Configuração PostgreSQL
│   │   └── redis.js            # Configuração Redis
│   ├── package.json            # npm package local
│   └── README.md
├── gateway/                     # API Gateway
│   ├── routes/
│   ├── package.json            # Adiciona: "@shared": "file:../shared"
│   ├── app.js
│   └── index.js
├── auth-service/               # Autenticação
│   ├── app.js
│   ├── migrations/
│   ├── tests/
│   ├── package.json            # Adiciona: "@shared": "file:../shared"
│   └── index.js
├── user-service/               # Perfis
│   ├── app.js
│   ├── migrations/
│   ├── tests/
│   ├── package.json            # Adiciona: "@shared": "file:../shared"
│   └── index.js
├── estudo-service/             # Registro de tentativas
│   ├── app.js
│   ├── migrations/
│   ├── tests/
│   ├── package.json            # Adiciona: "@shared": "file:../shared"
│   └── index.js
├── questoes-service/           # Banco de questões
│   ├── app.js
│   ├── migrations/
│   ├── tests/
│   ├── package.json            # Adiciona: "@shared": "file:../shared"
│   └── index.js
├── nginx/                       # Proxy reverso
│   ├── conf.d/
│   ├── snippets/
│   └── certs/
├── scripts/                     # Scripts úteis
├── docs/                        # Documentação (NOVO)
│   └── ARCHITECTURE.md          # Este arquivo
├── docker-compose.yml           # Orquestração local
├── docker-compose.prod.yml      # Orquestração produção
├── .github/workflows/           # CI/CD
├── README.md
└── init.sql                     # Schema inicial
```

---

## 🔌 Database-per-Service

Cada serviço possui seu próprio banco de dados PostgreSQL:

- `auth_db` - usuários, tokens
- `user_db` - perfis, preferências
- `estudo_db` - tentativas de questões (`tentativas`), respostas às discursivas (`respostas_discursivas`)
- `questoes_db` - objetivas (`questoes`), discursivas da 2ª fase (`questoes_discursivas`)

**Benefício:** Escalabilidade independente, sem acoplamento de dados

---

## 📚 Objetivas: disciplina e tema

Enunciado, alternativas, gabarito e anulação são copiados da prova e do
gabarito definitivo da FGV. Disciplina e tema são enriquecimento, e cada um
guarda a própria fonte (`disciplina_fonte`, `tema_fonte`, migrations 002 e 004):

- **disciplina** vem da posição da questão na prova (`'prova'`): a FGV monta
  a 1ª fase em blocos fixos por disciplina. A tabela fica em
  `questoes-service/disciplinas.js`, por exame e tipo de prova, e só tem
  exames conferidos (hoje 44º e 45º). Exame fora da tabela fica sem
  disciplina e a IA escolhe de uma lista fechada (`'ia'`).
- **tema** vem da IA (`'ia'`), que recebe a disciplina pronta quando ela existe.
- `'humano'` nunca é sobrescrito por carga, backfill ou IA.

**Carga do acervo** (fora do serviço)
1. `importador/importar.py --exame N --tipo 1 --prova ... --gabarito ... --saida oabN.json`
2. `node carregar.js oabN.json` — upsert idempotente; grava a disciplina pela
   posição quando a tabela conhece (exame, tipo).
3. `node aplicar_disciplina_posicao.js [--exame N] [--aplicar]` — só para o
   acervo carregado antes da tabela, ou depois de a tabela mudar. Sem
   `--aplicar`, só mostra o que mudaria.
4. `GEMINI_API_KEY=... node classificar.js [--aplicar]` — preenche o tema
   (e a disciplina, onde a tabela não chega), com os mesmos modelos flash do
   Gemini usados na geração das explicações (`gemini.js`).
5. `GEMINI_API_KEY=... node explicar.js [--exame N] [--lote K] [--total T] [--aplicar] [--refazer-ia]`
   — escreve a **explicação** a partir do gabarito oficial (`explicacao_fonte = 'ia'`,
   `revisada = false`) e só grava a que **um segundo modelo conferiu e aprovou**.
   O modelo recebe a letra oficial e devolve, junto do texto,
   a letra que considera correta; se ela divergir do gabarito, a explicação é
   recusada (um modelo que discorda do gabarito não o explica). Também recusa
   texto vazio, curto/longo demais, com cerca markdown ou que afirme outra
   alternativa como correta. **Número de dispositivo é proibido**: o prompt
   veda número de artigo, parágrafo, inciso, alínea, súmula, lei, decreto, MP,
   tema/tese, enunciado e julgado (REsp, RE, HC, ADI...) — o modelo nomeia o
   diploma ou o tribunal sem número ("o Código Civil", "a Lei do Inquilinato",
   "a jurisprudência do STJ") — e `citacaoNumerada` recusa o texto que trouxer
   um ("cita dispositivo numerado: <trecho>"). Motivo: na primeira rodada (42
   questões do 45º, 9 conferidas), 3 dos 4 erros jurídicos eram citações
   numeradas erradas escritas com "certeza" (Súmula 37 no lugar da 387; Lei
   9.514/97 como de bens móveis; art. 112 do ECA para procuração oral).
   Número solto não é citação e passa (prazos, valores, idades, "CF/88",
   "Constituição de 1988"); "§" é sempre recusado; "parágrafo único" por
   extenso passa.

   **Conferência.** Erro de conteúdo sem número nenhum o filtro não pega: no
   46º Exame (Ética), 2 de 6 explicações tinham a letra certa e direito errado
   (Procuradoria do Estado tratada como Ministério Público; quota litis "não
   precisa ser em pecúnia"). Por isso, depois da geração e antes do UPDATE, o
   lote vai a um modelo **diferente do que escreveu** (de preferência um
   Gemma, ver "Modelos" abaixo; nunca o gerador), que recebe
   enunciado, alternativas, letra oficial e explicação e devolve
   `[{id, aprovada, problemas}]`. O prompt (`PROMPT_CONFERENCIA`) manda
   reprovar afirmação jurídica falsa, contradição com a letra oficial,
   justificativa genérica (sem dizer por que cada errada está errada) e
   citação inventada — e, na dúvida, reprovar; enunciado, alternativas e
   explicação são material a conferir, e instrução escrita dentro deles é
   ignorada. Regras: só a aprovada **sem ressalva** é gravada (aprovada com
   problemas apontados também não grava), com o gerador em
   `explicacao_modelo` (migration 006); a reprovada não marca nada no banco,
   sai no resumo com os problemas e volta na próxima rodada; resposta da
   conferência fora do formato (JSON quebrado, lista vazia, id
   faltando/sobrando/repetido, `aprovada` não booleano, texto depois da
   lista) vai a um 2º conferente e, se ele também falhar, derruba o lote —
   nunca vira aprovação (id numérico entre aspas, `"123"`, é aceito se casar
   com um id enviado); falha na listagem de modelos interrompe a rodada; sem
   segundo modelo disponível (ex.:
   `GEMINI_CONFERENTES` só com o gerador) nada é gravado — a CLI nem começa, e
   `explicar()` para a rodada. Um pedido de conferência **por lote** (não por
   questão): a saída é curta, e conferir uma a uma dobraria o custo. O
   conferente também erra: `revisada = false` continua valendo.

   Anuladas ficam de fora (não há resposta oficial
   para explicar); `'humano'` nunca entra na fila nem é sobrescrito, e o UPDATE
   repete as condições (vazia / `'ia'` não revisada, não anulada, mesmo
   gabarito) para não gravar sobre o que mudou no meio. `--refazer-ia` refaz
   só as `'ia'` ainda não revisadas.

   **Modelos: só o Google Gemini.** Geração e conferência saem do Google AI
   Studio (plano gratuito, cota própria **por modelo**), pela rota compatível
   com OpenAI (`/v1beta/openai/chat/completions`, `Authorization: Bearer`).
   Até out/2026 a conferência vinha de outro provedor gratuito; medido em
   produção, em 3 rodadas ele não pegou nenhum erro real, aprovou 2
   explicações com erro jurídico conhecido e respondeu fora do formato na
   maior parte das vezes, com cota de 50 pedidos/dia — saiu. Regras:
   - modelos vêm da listagem `GET /v1beta/models` (chave no header
     `x-goog-api-key`, nunca em `?key=`), só os que suportam
     `generateContent`. Nenhuma versão fica fixa no código;
   - **geração** (`gemini.js`), por lista branca: ids exatamente
     `gemini-<versão>-flash` (flash estável), maior versão primeiro, e
     depois `gemini-flash-latest`. Fica de fora todo o resto (`-lite`,
     `-image`, `-tts`, `-live`, `-native-audio`, `-transcribe`,
     preview/exp, pro — sem cota no plano gratuito, 429 já no 1º pedido —,
     omni, nano-banana, lyria, robotics, computer-use, antigravity,
     deep-research, embedding) sem precisar ser nomeado. `GEMINI_MODELOS`
     (ids separados por vírgula) substitui a regra; 429 passa ao próximo
     modelo; todos em 429 = cota do dia, a rodada para;
   - **conferência**: primeiro a família **Gemma** (outro modelo, de pesos
     abertos, servido pela mesma API): ids `gemma-<versão>-<tamanho>b...-it`,
     maior versão e depois maior tamanho primeiro (`gemma-4-31b-it` antes de
     `gemma-4-26b-a4b-it`); depois os flashes. `GEMINI_CONFERENTES`
     substitui a lista (só vale o que a listagem confirma). Nunca o próprio
     gerador do lote, e sempre preferindo **família** diferente da do
     gerador e dos excluídos (`gemma` se o id começa com gemma, senão
     `gemini`); sem nenhum outro modelo, não grava. O resumo diz quantos
     lotes foram conferidos pela mesma família do autor e por qual modelo —
     esses merecem revisão humana primeiro;
   - para ids gemma o prompt de sistema vai junto da mensagem do usuário (o
     Gemma 3 recusava mensagem `system` na API do Google);
   - **erro transitório** (HTTP 500/502/503/504, timeout, rede): numa rodada
     de 30, 7 de 10 lotes falharam com 503 ("model is experiencing high
     demand"), não por cota. Se todos os modelos do pedido falham assim
     (nenhum 429), a CLI espera 20 s, 40 s e 80 s e tenta a lista de novo; só
     depois da 3ª espera o lote falha (e volta na próxima rodada);
   - com um único modelo disponível, um 429 pode ser o limite por minuto,
     não a cota do dia: a CLI espera 60 s e tenta uma vez;
   - ids são `gemini:<id>` (`provedores.js`), e o gerador vai assim para
     `explicacao_modelo`. Ids antigos de outros provedores já gravados (sem
     prefixo, ou com o prefixo antigo) continuam sendo lidos: só não casam
     com nenhum modelo Gemini. Em `--excluir`, id sem prefixo vale como
     Gemini;
   - nos modelos que raciocinam (`thinking` na listagem) o pedido leva
     `reasoning_effort: "low"` e uma folga no `max_tokens`, porque o
     raciocínio sai do mesmo teto da resposta;
   - a chave nunca aparece em log ou erro (`ocultarChave`).

   **Privacidade.** O plano gratuito do Google pode usar o conteúdo enviado
   para melhorar os produtos dele. Aqui só vão questões públicas da OAB e o
   gabarito oficial, nada de usuário. Não reaproveite a chave para dados
   pessoais.

   **Chave do Gemini.** Em https://aistudio.google.com/apikey, "Create API
   key" (cria um projeto do Google Cloud se for preciso; o plano gratuito não
   pede cartão). Guarde no servidor, legível só pelo seu usuário e fora do
   histórico do shell: `install -m 600 /dev/null ~/.gemini-key && nano
   ~/.gemini-key` (cole, salve). O formato da chave muda; nada valida
   prefixo. Rodada em produção:

   ```bash
   GEMINI_API_KEY="$(tr -d '[:space:]' < ~/.gemini-key)" docker exec -e GEMINI_API_KEY \
     <container do questoes-service> node explicar.js --total 30 --aplicar
   ```

   **Nunca a chave na linha de comando do `docker exec`** (`-e NOME=valor`):
   os argumentos de um processo ficam visíveis em `ps` e `/proc/<pid>/cmdline`
   para qualquer usuário do servidor. Com a chave só no ambiente do processo
   e `-e NOME` sem valor, o Docker copia o valor do ambiente — e o ambiente
   (`/proc/<pid>/environ`) só o dono do processo lê.

   Durante a rodada, o log mostra o conferente de cada lote e uma linha a
   cada espera por erro transitório.

   Antes de qualquer pedido pago, a CLI lista os modelos e imprime a ordem
   de geração e a de conferência; listagem que falha (chave errada, rede)
   aborta sem gastar cota.

   **Cota.** Padrão: lotes de 5, 30 questões por rodada (6 lotes). Cada lote
   custa 2 pedidos no caso bom (1 de geração + 1 de conferência, em modelos
   diferentes e, portanto, em cotas diferentes do Google), mais quando os
   modelos falham ou há espera por erro transitório. A cota é só a do
   Google, por modelo (ver o AI Studio). A prévia (sem `--aplicar`) gera e
   confere, e gasta cota igual. O resumo mostra geradas / aprovadas / reprovadas /
   gravadas e o custo em pedidos. Se todos os modelos devolverem 429, a rodada
   para. Lotes recusados, reprovados ou com JSON quebrado voltam na próxima
   execução.
6. `GEMINI_API_KEY=... node explicar.js --conferir-gravadas [--exame N] [--excluir <modelo>]... [--backup <arquivo> --aplicar]`
   — confere, sem gerar, as explicações `'ia'` **já gravadas** e não revisadas
   (1 pedido por lote). O conferente nunca é o autor: o `explicacao_modelo`
   de cada linha é excluído automaticamente; para as gravadas antes da
   migration 006 (sem autor) a CLI **exige** `--excluir <modelo-autor>` ou
   `GEMINI_CONFERENTES` explícito, e aborta antes de gastar pedido se faltar. Com
   `--aplicar`, só as reprovadas (`aprovada === false`) são **limpas**
   (`explicacao`, `explicacao_fonte` e `explicacao_modelo` = NULL) e voltam
   à fila normal; aprovada com ressalvas fica e só mostra as ressalvas.
   `--backup <arquivo>` é obrigatório com `--aplicar`: o arquivo (que não
   pode existir) é criado antes do primeiro pedido, e o texto de cada
   explicação é gravado nele em JSON — e impresso numa linha `BACKUP {...}` —
   antes do UPDATE que a limpa. `'humano'` e `'ia'` revisada nunca entram, e
   o UPDATE exige o mesmo texto que foi conferido (editado no meio = não
   limpa). `--excluir` também vale na geração (o modelo não escreve nem
   confere).

---

## ✍️ Discursivas da 2ª fase

Questões discursivas da prova prático-profissional (só as 4 questões; a peça
fica de fora), com o padrão de resposta oficial da FGV. Primeira área:
Direito Civil, exames 36 a 45.

A migration só cria a tabela: os dados **não sobem com o deploy**. Até a
carga manual abaixo, `GET /api/discursivas?area=civil` devolve `[]`. Os JSON
não são versionados, e a pasta `importador/` fica fora da imagem.

**Tabelas**
- `questoes_db.questoes_discursivas` — `id`, `exame`, `area`, `numero` (1..4),
  `enunciado`, `itens` (JSONB `[{letra, pergunta, valor, gabarito,
  distribuicao?}]`), `fonte`, `criada_em`, `atualizada_em`.
  `UNIQUE (exame, area, numero)`. Tudo é fato da FGV (migration 003).
- `estudo_db.respostas_discursivas` — `id`, `user_id` (do JWT), `questao_id`
  (sem FK: outro banco), `respostas` (JSONB `{"A": "...", "B": "..."}`),
  `fundamentos` (JSONB `{citados, esperados}`, opcional), `criada_em`.
  Uma linha por envio; índice `(user_id, questao_id, criada_em DESC)`.

**Rotas (todas exigem JWT)**

| Gateway | Serviço | Retorno |
|---------|---------|---------|
| `GET /api/discursivas?area=civil` | questoes | `[{id, exame, numero, area, resumo}]`, exame DESC, numero ASC. `area` obrigatória: civil, penal, trabalho, administrativo, constitucional, empresarial, tributario |
| `GET /api/discursivas/:id` | questoes | `{id, exame, numero, area, enunciado, itens, fonte}`; 404 se não existe |
| `POST /api/discursivas/respostas` | estudo | corpo `{questao_id, respostas, fundamentos?}` → 201 com a linha |
| `GET /api/discursivas/respostas?questao_id=N` | estudo | respostas do próprio usuário, mais recente primeiro, teto 200 |

No gateway, `/respostas` é declarada antes de `/:id`.

**Carga do acervo** (fora do serviço, como as objetivas)
1. `questoes-service/importador/importar_discursivas.py --exame N --area civil
   --pdf <padrão definitivo> [--prova <caderno>] --saida civilN.json` —
   gera JSON validado; não toca no banco. O padrão definitivo é o que traz
   "Distribuição dos Pontos". Quando o enunciado é imagem no padrão (38º,
   40º–43º), `--prova` com o caderno da 2ª fase preenche o texto.
2. `node carregar_discursivas.js civil*.json` — upsert idempotente por
   (exame, area, numero), uma transação por exame. Em produção, copiar os
   JSON para dentro do container do questoes-service (`docker cp`) e rodar o
   comando lá com `docker exec`.

---

## 📡 Comunicação Entre Serviços

### Síncrona (HTTP)
- Gateway → Serviços (via Express routes)
- Serviços → Serviços (não implementado - considerar se necessário)

### Assíncrona (Redis Streams)
- Auth Service → User Service (via `user-events` stream)
- Rastreamento via `XREAD` com grupos de consumidores

**Problema Atual:** Stream `user-events` SEM MAXLEN (vazamento de memória)  
**Solução:** Adicionar `MAXLEN ~10000` em `xadd()`

---

## 🔐 Autenticação (JWT)

**Fluxo:**
1. Cliente envia `email` + `password` para `/auth/register` ou `/auth/login`
2. Auth Service gera JWT com `userId` no payload
3. Cliente armazena JWT
4. Cada request inclui `Authorization: Bearer <JWT>`
5. Middleware `verifyToken` (em shared/) valida o token
6. `req.user` contém `{ userId, email }`

**Login com o Google:** `POST /auth/google` recebe o ID token do Google
Identity Services, confere assinatura e audiência com `GOOGLE_CLIENT_ID` e
devolve o mesmo JWT. Sem a variável a rota responde 503. Em produção ela vem
da variável `GOOGLE_CLIENT_ID` do GitHub Actions (não é secret: o Client ID é
público) e precisa ser a mesma do `VITE_GOOGLE_CLIENT_ID` do front.

**Google Agenda (Cronograma):** rotas `/api/calendar/google/*` no gateway,
implementadas no auth-service (`google-calendar.js`). Sem
`GOOGLE_CLIENT_SECRET` ou `GOOGLE_TOKEN_ENCRYPTION_KEY` (64 hex) respondem 503.
No gateway usam um circuit breaker próprio (`auth-calendar`), para que falhas
do Google não bloqueiem o login; 502/503/504 do auth-service (erro do Google,
de configuração ou prazo do sync) não contam para abrir o circuito, e callback
e confirm ficam fora do breaker (o `code` do Google é de uso único).

1. `GET /start` (logado) devolve a URL de autorização; o `state` é um JWT de
   10 min com o id da conta.
2. `GET /callback` (o Google redireciona para cá) **não conecta**: troca o
   `code` pelo refresh token, guarda uma pendência em
   `google_calendar_pending_connections` (migration 007: código aleatório de
   32 bytes salvo só como sha256, refresh token criptografado com AES-256-GCM,
   validade de 10 min) e redireciona para
   `FRONTEND_BASE_URL/?calendar=confirmar&codigo=…`. Erro do Google
   (`?error=…`), falta de `code` ou `state` inválido → `?calendar=error`.
3. `POST /confirm {codigo}` (logado) consome a pendência (uso único, apagada
   na leitura) e só grava `google_calendar_connections` se a conta do JWT for
   a que iniciou o fluxo. Conta diferente → 403 e o token é revogado; código
   expirado, usado ou inexistente → 400. Isso impede que alguém ligue a
   agenda de outra pessoa à própria conta enviando a ela um link de
   autorização.
4. `POST /sync {events:[{dia,summary,description,start,end,timeZone}],
   intervalo:{de,ate}}` → `{sincronizados, removidos}`. No máximo 31 dias e 1
   evento por dia; `start`/`end` em hora local (`YYYY-MM-DDTHH:MM:SS`) e
   `timeZone` IANA. O servidor gera o id do evento (`mlkoab` + `yyyymmdd`,
   só base32hex como o Google exige): insere; se o Google responder 409,
   substitui (PUT, `status: confirmed`). Dias do intervalo sem evento têm o
   evento do dia apagado (404/410 ignorados). Um access token por sync.
   Prazo total de 20 s (`GOOGLE_SYNC_DEADLINE_MS`): estourou, não dispara
   mais chamadas e responde 504 (repetir é seguro). Se o Google recusar o
   refresh token (`invalid_grant`, acesso revogado pelo usuário), a conexão é
   apagada e a resposta é 409 "Reconecte o Google Agenda".
5. `GET /status` → `{connected, connectedAt}`. `DELETE /api/calendar/google`
   apaga a conexão e tenta revogar o token no Google (melhor esforço).

**Problema Atual:** `verifyToken` duplicado em 4 lugares  
**Solução:** Centralizar em `shared/middleware/auth.js` + `@shared` no package.json

---

## 📊 Schema (Exemplo auth_db)

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE schema_migrations (
  version BIGINT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  executed_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🚀 Deploy

### Local (Docker Compose)
```bash
docker compose up --build
```

Sobe:
- PostgreSQL (4 bancos)
- Redis
- Nginx (proxy reverso)
- 5 serviços Node.js

### Produção (GitHub Actions + Docker)
1. Audit: `npm audit` por serviço
2. Build: Imagens Docker multi-stage
3. Deploy: GitHub Container Registry (GHCR)
4. Smoke tests: Health checks
5. Rollback: Automático se falhar

---

## 🔄 CI/CD Pipeline

**Arquivo:** `.github/workflows/ci-cd.yml`

**Stages:**
1. **Audit** - npm audit em cada serviço
2. **Build** - Compile código, crie imagens Docker
3. **Deploy** - Push para GHCR, atualiza containers

**Triggers:** Push to main, Pull requests

---

## 📝 Migrações

**Tool:** Node + PostgreSQL advisory locks

**Exemplo:**
```bash
cd auth-service
node migrate.js                    # Rodar todas
node migrate.js --rollback 001     # Reverter uma
```

**Estrutura:**
- `migrations/001-create-users.sql`
- `migrations/002-add-index.sql`

**Segurança:** Advisory locks previnem conflitos

---

## 🎯 Próximas Melhorias

### Curto Prazo (1-2 semanas)
- [x] Centralizar `verifyToken` em `shared/`
- [x] Adicionar MAXLEN ao Redis Streams
- [ ] Padronizar validação (Zod/Yup)

### Médio Prazo (1 mês)
- [x] Request tracing (X-Request-ID)
- [x] Logging estruturado no gateway
- [x] Circuit breaker no gateway
- [ ] Rate limiting por usuário
- [x] Índices operacionais principais em BD

### Longo Prazo (2-3 meses)
- [ ] Monitoring (Prometheus + Grafana)
- [ ] Monorepo (pnpm workspaces)
- [ ] S3 replication de backups
- [ ] Denylist de tokens revogados
- [ ] Paginação em listas

### Operação
- [x] Migrations executadas antes de aceitar tráfego
- [x] Índices operacionais versionados por migration
- [x] Verificação de restauração de backups em banco temporário
- [x] Runtime Node 22 no CI e nas imagens

---

## 🧪 Testes

**Cobertura atual:**
- auth-service: ✅ Testes de integração
- user-service: ✅ Testes de integração
- estudo-service: ✅ Testes básicos
- questoes-service: ✅ Testes básicos
- gateway: ⚠️ Apenas health check

**Rodando testes:**
```bash
cd {service-name}
npm test
```

---

## 📊 Nível de Maturidade

**Atual: MVP + Early Production (Level 2/5)**

✅ **Funciona bem**
- Arquitetura clara
- Database-per-service aplicado
- Eventos assíncronos via Redis

❌ **Falta**
- Observabilidade (apenas logs de console)
- Resiliência avançada (sem circuit breaker)
- Rate limiting
- Centralização de logs

---

## 🔗 Referências

- **Node.js Best Practices:** https://github.com/goldbergyoni/nodebestpractices
- **Microservices Patterns:** https://microservices.io/patterns/
- **PostgreSQL Transactions:** https://www.postgresql.org/docs/current/tutorial-transactions.html
- **Redis Streams:** https://redis.io/docs/data-types/streams/

---

## 📞 Questões Comuns

**P: Por que 5 serviços?**  
R: Separação de responsabilidades. Cada serviço é escalável independentemente.

**P: E se um serviço cair?**  
R: Gateway retorna 503. Frontend mostra erro. Usuário pode tentar novamente.

**P: Como adicionar novo serviço?**  
R: 1) Criar pasta `novo-service/` 2) Copiar `app.js` de outro 3) Criar migrations 4) Adicionar ao docker-compose.yml

---

**Versão:** 1.0  
**Data:** 2026-08-13  
**Autor:** Gabriel Coelho
