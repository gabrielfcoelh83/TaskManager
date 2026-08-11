#!/usr/bin/env bash
#
# Sobe o backend dos testes e2e e deixa o usuário criado.
#
# Um script só, usado pelo CI e pela sua máquina — se fossem dois, divergiriam
# no primeiro ajuste e o "passa aqui, falha lá" viraria rotina.
#
#   ./scripts/e2e-backend.sh          # sobe e semeia
#   ./scripts/e2e-backend.sh down     # derruba e limpa os volumes
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.e2e.yml"
PORTA="${GATEWAY_PORT:-3000}"
EMAIL="${E2E_EMAIL:-maria.lais@email.com}"
SENHA="${E2E_SENHA:-senha-de-teste-123}"

if [ "${1:-up}" = "down" ]; then
  # -v porque o banco tem de nascer vazio na próxima subida: é o que garante
  # que o init.sql roda e que nenhum teste herda tentativa da execução anterior.
  $COMPOSE down -v
  exit 0
fi

echo "Subindo o backend (postgres, redis, auth, estudo, gateway)…"
# --wait respeita os healthchecks do compose: quando ele volta, os serviços
# responderam de verdade. Sem isso restaria adivinhar um `sleep`.
$COMPOSE up -d --wait

echo "Criando o usuário de teste…"
# 400 quando o e-mail já existe é resultado esperado, não erro: o script tem de
# poder rodar duas vezes seguidas sem falhar.
CODIGO=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "http://localhost:${PORTA}/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Maria Lais\",\"email\":\"${EMAIL}\",\"password\":\"${SENHA}\"}")

case "$CODIGO" in
  201|200) echo "  usuário criado" ;;
  400|409)  echo "  usuário já existia" ;;
  *)
    echo "  ✗ registro devolveu HTTP ${CODIGO}" >&2
    $COMPOSE logs --tail=30 auth-service api-gateway >&2
    exit 1
    ;;
esac

# O login é o que os testes fazem de verdade; verificar aqui separa "o backend
# está errado" de "o teste está errado" antes de o Playwright sequer abrir.
TOKEN=$(curl -s -X POST "http://localhost:${PORTA}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${SENHA}\"}" | jq -r '.token // empty')

if [ -z "$TOKEN" ]; then
  echo "  ✗ login não devolveu token" >&2
  $COMPOSE logs --tail=30 auth-service >&2
  exit 1
fi

# Prova que o token emitido pelo auth-service é aceito pelo estudo-service —
# ou seja, que os dois estão com o mesmo JWT_SECRET.
STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
  "http://localhost:${PORTA}/api/tentativas" -H "Authorization: Bearer ${TOKEN}")

if [ "$STATUS" != "200" ]; then
  echo "  ✗ GET /api/tentativas devolveu ${STATUS} com token válido" >&2
  echo "    (401 aqui costuma ser JWT_SECRET diferente entre auth e estudo)" >&2
  $COMPOSE logs --tail=30 estudo-service >&2
  exit 1
fi

echo "Backend pronto em http://localhost:${PORTA}"
