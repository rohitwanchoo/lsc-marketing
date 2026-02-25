#!/bin/bash
# ============================================================
# LSC Marketing Automation — Database Migration Runner
#
# Usage:
#   cd /var/www/html/lsc_marketing_automation
#   bash scripts/migrate.sh
#
# The script loads .env from the project root (if present) and
# applies every migration file in database/migrations/ in
# lexicographic (numeric) order.
#
# Environment variables (all have defaults):
#   DB_USER     — default: lsc_user
#   DB_PASSWORD — default: lsc_pass
#   DB_HOST     — default: localhost
#   DB_PORT     — default: 5432
#   DB_NAME     — default: lsc_marketing
# ============================================================
set -e

# Change to the project root so relative paths work regardless
# of where the script is called from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Load .env if present (silently skip if missing)
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -o allexport
  source .env
  set +o allexport
fi

DB_URL="postgresql://${DB_USER:-lsc_user}:${DB_PASSWORD:-lsc_pass}@${DB_HOST:-localhost}:${DB_PORT:-5432}/${DB_NAME:-lsc_marketing}"

echo "============================================================"
echo " LSC Marketing Automation — Database Migrations"
echo " Target: ${DB_HOST:-localhost}:${DB_PORT:-5432}/${DB_NAME:-lsc_marketing}"
echo "============================================================"

MIGRATION_DIR="database/migrations"

if [ ! -d "$MIGRATION_DIR" ]; then
  echo "ERROR: Migration directory not found: $MIGRATION_DIR"
  exit 1
fi

# Collect and sort migration files
MIGRATIONS=($(ls "$MIGRATION_DIR"/*.sql 2>/dev/null | sort))

if [ ${#MIGRATIONS[@]} -eq 0 ]; then
  echo "No migration files found in $MIGRATION_DIR"
  exit 0
fi

echo "Running ${#MIGRATIONS[@]} migration(s)..."
echo ""

SUCCESS=0
FAILED=0

for f in "${MIGRATIONS[@]}"; do
  filename="$(basename "$f")"
  echo "  Applying: $filename"
  if psql "$DB_URL" -f "$f" -v ON_ERROR_STOP=1 --single-transaction -q 2>&1; then
    echo "  [OK] $filename"
    SUCCESS=$((SUCCESS + 1))
  else
    echo "  [FAILED] $filename — aborting"
    FAILED=$((FAILED + 1))
    exit 1
  fi
done

echo ""
echo "============================================================"
echo " Migrations complete: $SUCCESS applied, $FAILED failed."
echo "============================================================"
