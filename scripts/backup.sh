#!/usr/bin/env bash
# Dump the production database to a timestamped gzipped file.
#
# Usage (from project root):
#
#   scripts/backup.sh                  # → backups/relai_YYYYMMDD_HHMM.sql.gz
#   scripts/backup.sh predeploy        # → backups/predeploy_YYYYMMDD_HHMM.sql.gz
#
# Recommended cron (nightly at 02:00, weekly cleanup of >30-day files):
#
#   0 2 * * *  cd /opt/relai && scripts/backup.sh nightly
#   0 3 * * 0  find /opt/relai/backups -name "*.sql.gz" -mtime +30 -delete
#
# Restore an existing dump:
#
#   gunzip -c backups/relai_20260623_0200.sql.gz \
#     | docker compose exec -T db psql -U relai_user relai

set -euo pipefail

PREFIX="${1:-relai}"
TIMESTAMP=$(date +%Y%m%d_%H%M)
BACKUP_DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
OUTFILE="${BACKUP_DIR}/${PREFIX}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

# Read DB user/name from .env so this works regardless of customization.
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing .env at $ENV_FILE — aborting." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -o allexport && source "$ENV_FILE" && set +o allexport

echo "Backing up to $OUTFILE ..."
docker compose exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "$OUTFILE"

# Print size and exit OK.
SIZE=$(du -h "$OUTFILE" | cut -f1)
echo "Done. $OUTFILE ($SIZE)"
