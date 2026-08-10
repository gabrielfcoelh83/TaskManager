#!/bin/bash
# Emite o certificado do Let's Encrypt e o instala para o nginx.
#
# Requer a porta 80 alcançável pela internet: o desafio HTTP-01 faz o
# Let's Encrypt buscar um arquivo em http://$DOMINIO/.well-known/...
# Se a Security List da VCN bloquear a 80, isto falha — e essa é a causa
# mais comum, não erro de configuração.
#
#   ./scripts/issue-cert.sh                 # emite de verdade
#   STAGING=1 ./scripts/issue-cert.sh       # ambiente de teste, sem gastar cota
set -euo pipefail
cd "$(dirname "$0")/.."

DOMINIO="${DOMINIO:-163-176-30-179.sslip.io}"
EMAIL="${EMAIL:-gabrielfcoelh83@gmail.com}"
COMPOSE="${COMPOSE:-docker-compose.prod.yml}"

ARGS=(certonly --webroot -w /var/www/certbot -d "$DOMINIO"
      --email "$EMAIL" --agree-tos --no-eff-email --non-interactive)
[ "${STAGING:-0}" = "1" ] && ARGS+=(--staging --break-my-certs)

echo "Solicitando certificado para $DOMINIO ${STAGING:+(staging)}"
docker run --rm \
  -v "$PWD/certbot/conf":/etc/letsencrypt \
  -v "$PWD/certbot/www":/var/www/certbot \
  certbot/certbot "${ARGS[@]}"

echo "Instalando o certificado para o nginx..."
cp "certbot/conf/live/$DOMINIO/fullchain.pem" nginx/certs/fullchain.pem
cp "certbot/conf/live/$DOMINIO/privkey.pem"   nginx/certs/privkey.pem
chmod 644 nginx/certs/fullchain.pem
chmod 600 nginx/certs/privkey.pem

docker compose -f "$COMPOSE" exec -T nginx nginx -s reload
echo "Certificado ativo. Validade:"
openssl x509 -in nginx/certs/fullchain.pem -noout -enddate -issuer
