#!/usr/bin/env bash
# Production-friendly migration runner.
#
# Usage from the project root, on the deployed server:
#
#   scripts/migrate.sh                # apply all pending migrations
#   scripts/migrate.sh status         # show current revision + history
#   scripts/migrate.sh new "message"  # autogenerate a new migration
#   scripts/migrate.sh down           # roll back the latest migration
#
# Always backup the DB before running migrations in production:
#
#   docker compose exec -T db pg_dump -U relai_user relai \
#     | gzip > backups/predeploy_$(date +%Y%m%d_%H%M).sql.gz

set -euo pipefail

CMD="${1:-upgrade}"

case "$CMD" in
  upgrade|"")
    docker compose exec backend alembic upgrade head
    ;;
  status)
    docker compose exec backend alembic current
    docker compose exec backend alembic history --verbose
    ;;
  new)
    if [ -z "${2:-}" ]; then
      echo "Usage: scripts/migrate.sh new \"short description\""
      exit 1
    fi
    docker compose exec backend alembic revision --autogenerate -m "$2"
    echo
    echo "Migration generated in backend/alembic/versions/. Review the file"
    echo "before committing — autogenerate is good but not perfect, especially"
    echo "for enum changes and column renames."
    ;;
  down)
    docker compose exec backend alembic downgrade -1
    ;;
  *)
    echo "Unknown command: $CMD"
    echo "Usage: scripts/migrate.sh [upgrade|status|new \"msg\"|down]"
    exit 1
    ;;
esac
