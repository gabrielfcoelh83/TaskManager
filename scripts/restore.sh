#!/bin/bash
# Restaura um banco a partir de um dump.
#
#   ./scripts/restore.sh backups/auth_db-20260810-190000.sql.gz auth_db
#
# DESTRUTIVO: derruba as conexões e recria o banco do zero. O que estiver
# lá agora e não estiver no dump é perdido.
set -euo pipefail
cd "$(dirname "$0")/.."

ARQUIVO="${1:?uso: $0 <arquivo.sql.gz> <nome_do_banco>}"
BANCO="${2:?uso: $0 <arquivo.sql.gz> <nome_do_banco>}"
CONTAINER="${CONTAINER:-microservices-project-postgres-1}"

[ -f "$ARQUIVO" ] || { echo "arquivo não encontrado: $ARQUIVO"; exit 1; }

echo "⚠️  Isto APAGA o banco '$BANCO' e o recria a partir de $ARQUIVO"
read -r -p "Digite o nome do banco para confirmar: " confirma
[ "$confirma" = "$BANCO" ] || { echo "cancelado"; exit 1; }

echo "Derrubando conexões..."
docker exec "$CONTAINER" psql -U postgres -d postgres -q -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$BANCO' AND pid<>pg_backend_pid()" > /dev/null

docker exec "$CONTAINER" psql -U postgres -d postgres -q -c "DROP DATABASE IF EXISTS $BANCO"
docker exec "$CONTAINER" psql -U postgres -d postgres -q -c "CREATE DATABASE $BANCO"

echo "Restaurando..."
gunzip -c "$ARQUIVO" | docker exec -i "$CONTAINER" psql -U postgres -d "$BANCO" -q

echo "✅ $BANCO restaurado. Reinicie os serviços para reconectar:"
echo "   docker compose -f docker-compose.prod.yml restart auth-service user-service task-service"
