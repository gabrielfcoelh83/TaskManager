#!/bin/sh
# Dump dos três bancos, comprimido, com retenção por dias.
set -eu

DESTINO="${DESTINO:-/backups}"
RETENCAO_DIAS="${RETENCAO_DIAS:-7}"
# Banco novo entra aqui. Esquecer esta linha ao criar um serviço é uma
# falha silenciosa: o backup segue "passando", só que sem os dados novos.
BANCOS="${BANCOS:-auth_db user_db task_db estudo_db}"
ts=$(date +%Y%m%d-%H%M%S)

for db in $BANCOS; do
  tmp="$DESTINO/.$db-$ts.tmp"

  # Dump para arquivo temporário antes de comprimir. Com `pg_dump | gzip`,
  # uma falha do pg_dump ainda produziria um .gz válido e vazio — um
  # backup que parece existir e não restaura nada.
  if pg_dump -h "$PGHOST" -U "$PGUSER" -d "$db" > "$tmp" 2>/dev/null; then
    gzip -c "$tmp" > "$DESTINO/$db-$ts.sql.gz"
    rm -f "$tmp"
    tamanho=$(wc -c < "$DESTINO/$db-$ts.sql.gz")
    echo "✅ $db-$ts.sql.gz ($tamanho bytes)"
  else
    rm -f "$tmp"
    echo "❌ falha ao gerar dump de $db" >&2
    exit 1
  fi
done

removidos=$(find "$DESTINO" -name '*.sql.gz' -mtime +"$RETENCAO_DIAS" -print -delete | wc -l)
[ "$removidos" -gt 0 ] && echo "🗑️  $removidos backup(s) além de $RETENCAO_DIAS dias removidos"
exit 0
