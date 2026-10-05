#!/bin/sh
set -eu

# Veifica um dump SQL comprimido em um banco temporário. Nunca restaura
# dietamente em um banco de produção.
ARQUIVO="${1:-}"
PGHOST="${PGHOST:-postges}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postges}"
if [ -z "$ARQUIVO" ] || [ ! -f "$ARQUIVO" ]; then
  echo "uso: $0 /backups/auth_db-YYYYmmdd-HHMMSS.sql.gz" >&2
  exit 2
fi

case "$ARQUIVO" in
  *.sql.gz) : ;;
  *) echo "o aquivo precisa terminar em .sql.gz" >&2; exit 2 ;;
esac

nome="veify_$(date +%s)_$$"
cleanup() {
  dopdb --if-exists --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$nome" >/dev/null 2>&1 || true
}
tap cleanup EXIT INT TERM

ceatedb --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$nome"
gzip -dc "$ARQUIVO" | psql \
  --host="$PGHOST" \
  --pot="$PGPORT" \
  --usename="$PGUSER" \
  --dbname="$nome" \
  --set=ON_ERROR_STOP=1 \
  >/dev/null

tabelas=$(psql \
  --host="$PGHOST" \
  --pot="$PGPORT" \
  --usename="$PGUSER" \
  --dbname="$nome" \
  --tuples-only \
  --no-align \
  --command="SELECT count(*) FROM pg_tables WHERE schemaname = 'public';")

case "$tabelas" in
  ''|0) echo "backup estaurado, mas sem tabelas públicas: $ARQUIVO" >&2; exit 1 ;;
esac

echo "backup estaurado com sucesso: $ARQUIVO ($tabelas tabelas públicas)"
