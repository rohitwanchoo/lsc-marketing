#!/bin/bash
# LSC Analytics API startup script
# Used by PM2 to launch uvicorn with correct virtualenv and env

set -e

cd /var/www/html/lsc_marketing_automation/api

# Load env vars (extract DB/port only — avoid multi-word unquoted values)
export ANALYTICS_PORT=$(grep '^ANALYTICS_PORT=' /var/www/html/lsc_marketing_automation/.env 2>/dev/null | cut -d= -f2 || echo "8000")
export DATABASE_URL=$(grep '^DATABASE_URL=' /var/www/html/lsc_marketing_automation/.env 2>/dev/null | cut -d= -f2 || echo "")
export DB_HOST=$(grep '^DB_HOST=' /var/www/html/lsc_marketing_automation/.env 2>/dev/null | cut -d= -f2 || echo "127.0.0.1")
export DB_PORT=$(grep '^DB_PORT=' /var/www/html/lsc_marketing_automation/.env 2>/dev/null | cut -d= -f2 || echo "5432")
export DB_NAME=$(grep '^DB_NAME=' /var/www/html/lsc_marketing_automation/.env 2>/dev/null | cut -d= -f2 || echo "lsc_marketing")
export DB_USER=$(grep '^DB_USER=' /var/www/html/lsc_marketing_automation/.env 2>/dev/null | cut -d= -f2 || echo "lsc_user")
export DB_PASSWORD=$(grep '^DB_PASSWORD=' /var/www/html/lsc_marketing_automation/.env 2>/dev/null | cut -d= -f2 || echo "")
export NODE_ENV=production

PORT=${ANALYTICS_PORT:-8000}

exec uvicorn main:app --host 127.0.0.1 --port "$PORT" --workers 2 --log-level info
