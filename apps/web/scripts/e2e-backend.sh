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

# As imagens são `:latest`, e `docker compose up` NÃO rebusca uma tag que já
# está em cache. Na sua máquina isso significa subir o backend de semanas
# atrás: hoje custou dois vermelhos que pareciam bug de front — o PATCH de
# feedback voltando 404 porque o gateway em cache não tinha a rota, e a coluna
# `tipo` ausente porque o estudo-service em cache não tinha a migration. No CI
# o runner nasce vazio e o pull acontece de qualquer jeito, então isto só
# custa tempo onde já se pagaria por ele.
echo "Atualizando as imagens do backend…"
$COMPOSE pull -q

echo "Subindo o backend (postgres, redis, auth, estudo, questoes, gateway)…"
# --wait respeita os healthchecks do compose: quando ele volta, os serviços
# responderam de verdade. Sem isso restaria adivinhar um `sleep`.
$COMPOSE up -d --wait

# O acervo entra depois do `--wait` de propósito: a tabela `questoes` nasce da
# migration do questoes-service, que só roda quando o container sobe. Aplicar
# antes daria "relation does not exist".
echo "Semeando o acervo de questões…"
$COMPOSE exec -T postgres psql -q -U postgres -d questoes_db < tests/e2e-questoes.sql

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

# Mesma verificação para o acervo. A tela de questões fica inutilizável se esta
# rota falhar, e o sintoma no Playwright seria "botão não encontrado" — que faz
# procurar bug no front por um bom tempo antes de olhar para o backend.
QUANTAS=$(curl -s "http://localhost:${PORTA}/api/questoes?limite=200" \
  -H "Authorization: Bearer ${TOKEN}" | jq 'length // 0')

if [ "${QUANTAS:-0}" -lt 1 ]; then
  echo "  ✗ GET /api/questoes não devolveu questão nenhuma" >&2
  $COMPOSE logs --tail=30 questoes-service api-gateway >&2
  exit 1
fi
echo "  acervo com ${QUANTAS} questões"

echo "Backend pronto em http://localhost:${PORTA}"
