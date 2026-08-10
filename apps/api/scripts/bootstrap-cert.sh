#!/bin/bash
# Gera um certificado autoassinado se ainda não houver nenhum.
# Serve só para o nginx conseguir iniciar o bloco 443 antes de o
# Let's Encrypt entrar em cena — um proxy que não sobe derruba tudo.
set -euo pipefail
cd "$(dirname "$0")/.."

# O compose monta estes caminhos; se o Docker os criar, vêm como root.
mkdir -p nginx/certs certbot/www certbot/conf

if [ -f nginx/certs/fullchain.pem ] && [ -f nginx/certs/privkey.pem ]; then
  echo "Certificado já existe em nginx/certs — nada a fazer."
  exit 0
fi

echo "Gerando certificado autoassinado provisório..."
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout nginx/certs/privkey.pem \
  -out nginx/certs/fullchain.pem \
  -subj "/CN=${DOMINIO:-localhost}" 2>/dev/null
chmod 644 nginx/certs/fullchain.pem
chmod 600 nginx/certs/privkey.pem
echo "Pronto. Substitua pelo Let's Encrypt com scripts/issue-cert.sh"
