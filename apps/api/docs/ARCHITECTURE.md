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
| **Task Service** | 3003 | `task_db` | CRUD de tarefas |
| **Estudo Service** | 3004 | `estudo_db` | Registro de tentativas de questões |
| **Questões Service** | 3005 | `questoes_db` | Banco de questões do Exame de Ordem |

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
│   │   ├── question.js
│   │   └── task.js
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
├── task-service/               # Tarefas
│   ├── app.js
│   ├── migrations/             # (NOVO)
│   ├── tests/                  # (NOVO - sem testes atualmente)
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
- `task_db` - tarefas
- `estudo_db` - tentativas de questões
- `questoes_db` - banco de questões

**Benefício:** Escalabilidade independente, sem acoplamento de dados

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
- PostgreSQL (5 bancos)
- Redis
- Nginx (proxy reverso)
- 6 serviços Node.js

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
- [ ] Adicionar MAXLEN ao Redis Streams (1 linha)
- [ ] Testes para task-service
- [ ] Padronizar validação (Zod/Yup)

### Médio Prazo (1 mês)
- [ ] Request tracing (X-Request-ID)
- [ ] Logging centralizado (Winston/Pino)
- [ ] Circuit breaker (Opossum)
- [ ] Rate limiting por usuário
- [ ] Índices faltantes em BD

### Longo Prazo (2-3 meses)
- [ ] Monitoring (Prometheus + Grafana)
- [ ] Monorepo (pnpm workspaces)
- [ ] S3 replication de backups
- [ ] Denylist de tokens revogados
- [ ] Paginação em listas

---

## 🧪 Testes

**Cobertura atual:**
- auth-service: ✅ Testes de integração
- user-service: ✅ Testes de integração
- estudo-service: ✅ Testes básicos
- questoes-service: ✅ Testes básicos
- task-service: ❌ SEM TESTES (oportunidade)
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
- Testes de task-service
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

**P: Por que 6 serviços?**  
R: Separação de responsabilidades. Cada serviço é escalável independentemente.

**P: E se um serviço cair?**  
R: Gateway retorna 503. Frontend mostra erro. Usuário pode tentar novamente.

**P: Como adicionar novo serviço?**  
R: 1) Criar pasta `novo-service/` 2) Copiar `app.js` de outro 3) Criar migrations 4) Adicionar ao docker-compose.yml

---

**Versão:** 1.0  
**Data:** 2026-08-13  
**Autor:** Gabriel Coelho
