#!/usr/bin/env bash
# Production deploy pipeline. Run from the project root on the deployed server
# after `git pull`.
#
# Usage:
#
#   scripts/deploy.sh           # build + restart + run pending migrations
#   scripts/deploy.sh --first   # first-time deploy: also stamps + seeds
#
# What it does, in order:
#   1. Sanity-checks that .env exists and isn't the example template
#   2. Backs up the database (skipped on --first since there's nothing yet)
#   3. Builds new images (backend + frontend)
#   4. Brings everything up with the prod overlay
#   5. Waits for db healthy, then applies alembic migrations
#   6. On --first, runs the seeds (admin + services, then inventory)
#   7. Prints the post-deploy checklist

set -euo pipefail

cd "$(dirname "$0")/.."

FIRST_RUN=0
if [ "${1:-}" = "--first" ]; then
  FIRST_RUN=1
fi

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

# 1. Sanity-check .env
if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.production.example and fill in fresh secrets." >&2
  exit 1
fi
if grep -q "GENERATE_ME_" .env; then
  echo "Refusing to deploy: .env still contains GENERATE_ME_* placeholders." >&2
  echo "Fill in real secrets first." >&2
  exit 1
fi

# 2. Backup (skip on first deploy — nothing to back up)
if [ "$FIRST_RUN" = "0" ]; then
  echo "==> Backing up DB before deploy..."
  scripts/backup.sh predeploy
fi

# 2b. Ensure TLS cert exists. gen-cert.sh is idempotent — it no-ops when
# certs/relai.crt + relai.key are already present, so this is safe on
# every deploy. Regenerate manually with: scripts/gen-cert.sh --force
echo "==> Ensuring TLS cert is present..."
scripts/gen-cert.sh

# 3 + 4. Build + up
echo "==> Building images..."
$COMPOSE build

echo "==> Starting services..."
$COMPOSE up -d

# nginx caches upstream IPs at startup. If backend/frontend were recreated by
# the up -d above, their IPs changed and nginx will 502 until restarted.
echo "==> Restarting nginx so it re-resolves upstream IPs..."
$COMPOSE restart nginx

# 5. Wait for db healthy then migrate.
echo "==> Waiting for db to be healthy..."
for i in $(seq 1 30); do
  if $COMPOSE ps db | grep -q "healthy"; then
    break
  fi
  sleep 1
done

echo "==> Applying migrations..."
$COMPOSE exec backend alembic upgrade head

# 6. First-time seeds
if [ "$FIRST_RUN" = "1" ]; then
  echo "==> Seeding admin + services..."
  $COMPOSE exec backend python seed.py

  echo "==> Seeding inventory..."
  $COMPOSE exec backend python seed_inventaire.py

  echo
  echo "First deploy complete."
  echo
  echo "Next steps:"
  echo "  1. Browse to https://192.0.2.20/ (accept the self-signed cert warning) and log in as admin@chu-valmont.fr / admin1234"
  echo "  2. CHANGE THE ADMIN PASSWORD IMMEDIATELY (Administration → admin → set new password)"
  echo "  3. Create real user accounts for the techs in Administration"
  echo "  4. Verify scripts/backup.sh runs cleanly: scripts/backup.sh test"
  echo "  5. Add the nightly cron: 0 2 * * *  cd $(pwd) && scripts/backup.sh nightly"
else
  echo
  echo "Deploy complete."
  echo "Current migration: $($COMPOSE exec backend alembic current | tail -1)"
fi
