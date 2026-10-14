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

PORTA="${GATEWAY_PORT:-3000}"
EMAIL="${E2E_EMAIL:-maria.lais@email.com}"
SENHA="${E2E_SENHA:-senha-de-teste-123}"

# O compose exige o segredo e não tem valor padrão de propósito (nenhum segredo
# fixo no repo). O CI gera um por execução; fora dele, gera-se aqui e fica
# guardado para a próxima subida — trocar o segredo a cada execução recriaria
# os containers à toa. Vem antes do `down` porque o compose interpola o
# arquivo inteiro até para derrubar.
#
# Vai por `--env-file`, e não só pelo ambiente: no WSL o `docker` costuma ser
# o docker.exe do Docker Desktop, e variável exportada no Linux não chega ao
# processo do Windows. O arquivo, ele lê pelo caminho relativo.
# `.env.e2e.local` cai no `*.local` do .gitignore.
ENV_E2E=.env.e2e.local
if [ -z "${E2E_JWT_SECRET:-}" ] && [ -f "$ENV_E2E" ]; then
  E2E_JWT_SECRET=$(sed -n 's/^E2E_JWT_SECRET=//p' "$ENV_E2E")
fi
export E2E_JWT_SECRET="${E2E_JWT_SECRET:-$(openssl rand -hex 32)}"
printf 'E2E_JWT_SECRET=%s\n' "$E2E_JWT_SECRET" > "$ENV_E2E"

COMPOSE="docker compose --env-file $ENV_E2E -f docker-compose.e2e.yml"

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

# As discursivas da 2ª fase só existem nas imagens do questoes-service que já
# criam a tabela. Antes delas, pular o seed é o esperado — e o e2e real da 2ª
# fase se pula junto; os que simulam a rota no navegador rodam de qualquer
# jeito. Falha do seed com a tabela presente (coluna renomeada, por exemplo)
# não derruba a suíte inteira: avisa aqui e o mesmo teste se pula.
TEM_DISCURSIVAS=$($COMPOSE exec -T postgres psql -tA -U postgres -d questoes_db \
  -c "SELECT to_regclass('public.questoes_discursivas') IS NOT NULL")
if [ "$(echo "$TEM_DISCURSIVAS" | tr -d '[:space:]')" = "t" ]; then
  echo "Semeando as questões discursivas…"
  $COMPOSE exec -T postgres psql -q -v ON_ERROR_STOP=1 -U postgres -d questoes_db < tests/e2e-discursivas.sql \
    || echo "  ✗ o seed de tests/e2e-discursivas.sql falhou — o e2e real da 2ª fase vai se pular" >&2
else
  echo "  questoes_discursivas ainda não existe nesta imagem — seed da 2ª fase pulado"
fi

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
