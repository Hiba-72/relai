#!/usr/bin/env bash
# Generate a self-signed TLS cert + key for the hospital LAN deployment.
#
# Output: certs/relai.crt and certs/relai.key
# Validity: ~825 days (browser upper bound for self-signed / non-public CAs)
# CN + SAN: 192.0.2.20 (the deployed server IP). Add more SANs below if the
# server later gets a hostname on the internal DNS.
#
# Usage:
#
#   scripts/gen-cert.sh          # skip if certs/ already has a key + cert
#   scripts/gen-cert.sh --force  # regenerate even if files exist
#
# Idempotent: safe to call from deploy.sh; it no-ops when certs are present.
#
# When the hospital's internal CA later issues a real cert, drop the CA-signed
# files into certs/ under the SAME filenames (relai.crt, relai.key) and
# restart nginx. Nothing else changes.

set -euo pipefail

cd "$(dirname "$0")/.."

CERT_DIR="certs"
CRT="$CERT_DIR/relai.crt"
KEY="$CERT_DIR/relai.key"
CN="192.0.2.20"
DAYS=825

FORCE=0
if [ "${1:-}" = "--force" ]; then
  FORCE=1
fi

mkdir -p "$CERT_DIR"

if [ "$FORCE" = "0" ] && [ -f "$CRT" ] && [ -f "$KEY" ]; then
  echo "Cert already present at $CRT — skipping (pass --force to regenerate)."
  exit 0
fi

echo "==> Generating self-signed cert for CN=$CN (valid $DAYS days)..."

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$KEY" \
  -out "$CRT" \
  -days "$DAYS" \
  -subj "/CN=$CN/O=Relai/OU=IT/C=FR" \
  -addext "subjectAltName=IP:$CN,DNS:localhost"

chmod 600 "$KEY"
chmod 644 "$CRT"

echo "Wrote $CRT and $KEY."
echo
echo "To replace with a CA-issued cert later, overwrite these two files"
echo "(keep the same paths) and run: docker compose ... restart nginx"
