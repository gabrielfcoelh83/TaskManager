# Microserviços com Docker — Projeto de Estudos

Plataforma de tarefas dividida em serviços independentes, cada um com seu próprio banco de dados.

## Arquitetura

```
                    ┌─────────────┐
   Cliente ────────▶│ API Gateway │  :3000
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   ┌──────────┐      ┌──────────┐      ┌──────────┐
   │   Auth   │◀─────│   User   │      │   Task   │
   │  :3001   │      │  :3002   │      │  :3003   │
   └────┬─────┘      └────┬─────┘      └────┬─────┘
        │                 │                 │
        ▼                 ▼                 ▼
     auth_db           user_db           task_db
        └─────── PostgreSQL :5432 ───────────┘

              Redis :6379 (cache / eventos)
```

**Padrão aplicado:** database-per-service. Cada serviço é dono dos seus dados e só conversa com os outros via HTTP.

## Serviços

| Serviço | Porta | Responsabilidade |
|---|---|---|
| `api-gateway` | 3000 | Roteamento, ponto de entrada único |
| `auth-service` | 3001 | Registro, login, emissão e validação de JWT |
| `user-service` | 3002 | Perfis de usuário |
| `task-service` | 3003 | CRUD de tarefas |
| `postgres` | 5432 | Persistência (3 bancos) |
| `redis` | 6379 | Cache e message broker |

## Como rodar

```bash
docker compose up --build
```

Verificar se tudo subiu:

```bash
curl http://localhost:3000/health/services
```

## Testando a API

```bash
# 1. Registrar
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@exemplo.com","password":"senha123"}'

# 2. Login (guarde o token)
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@exemplo.com","password":"senha123"}' | jq -r .token)

# 3. Criar tarefa
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Estudar Docker","description":"Subir os containers"}'

# 4. Listar tarefas
curl http://localhost:3000/api/tasks -H "Authorization: Bearer $TOKEN"
```

## Roteiro de estudos

Cada item abaixo é uma modificação real neste código. Faça na ordem.

**1. Fundamentos**
- Suba os serviços e leia os logs (`docker compose logs -f auth-service`)
- Derrube só o task-service (`docker compose stop task-service`) e veja o gateway responder DOWN
- Entre num container: `docker compose exec postgres psql -U postgres auth_db`

**2. Comunicação entre serviços**
- Hoje user-service e task-service chamam auth-service em *toda* requisição para validar o token. Isso é um gargalo e um ponto único de falha. Substitua por validação local da assinatura JWT.
- Depois compare: quando validação centralizada faz sentido? (revogação de token)

**3. Cache com Redis**
- O Redis está no compose mas nenhum serviço usa. Adicione cache de perfil no user-service.
- Resolva a invalidação: o que acontece com o cache quando o perfil é atualizado?

**4. Eventos assíncronos** — ✅ FEITO
- O auth-service grava `user.registered` no Redis Stream `user-events` (`XADD`); o user-service consome via consumer group (`XREADGROUP` + `XACK`) e cria o perfil.
- Passamos por pub/sub primeiro e o evento se perdeu com o consumidor offline — daí a migração para Streams. Compare `user_id=5` (nome perdido, veio do backfill) com `user_id=6` (nome intacto, recuperado da fila).
- Pendente: limitar o tamanho da fila com `MAXLEN` no `XADD`, senão o histórico cresce sem fim.

**5. Resiliência**
- Adicione timeout e retry nas chamadas entre serviços
- Implemente circuit breaker (biblioteca `opossum`)
- Adicione `healthcheck` no docker-compose e `depends_on: condition: service_healthy`

**6. Observabilidade**
- Propague um `X-Request-ID` do gateway até os serviços e inclua nos logs
- Adicione métricas com `prom-client` e suba Prometheus + Grafana no compose

**7. Escala**
- `docker compose up --scale task-service=3` — o que quebra? Por quê?
- Coloque Nginx na frente como load balancer

## Problemas conhecidos (de propósito)

Estes são pontos de estudo, não bugs a corrigir cegamente:

- `JWT_SECRET` está hardcoded no compose — mova para `.env` / secrets
- Não há migrations, só `init.sql` que roda uma vez na criação do volume
- `GET /users` não tem controle de acesso (qualquer autenticado lista todos)
- Não há testes
- Todos os bancos vivem na mesma instância PostgreSQL (isolamento lógico, não físico)

## Comandos úteis

```bash
docker compose up --build          # subir tudo
docker compose down                # parar
docker compose down -v             # parar e apagar os dados
docker compose logs -f <serviço>   # acompanhar logs
docker compose ps                  # status
docker compose exec <serviço> sh   # shell no container
```
# TaskManager
