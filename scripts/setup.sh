#!/bin/bash
# ============================================================
# LSC Marketing Automation — One-Shot Setup Script
# ============================================================
set -e

RESET='\033[0m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'

log()    { echo -e "${BLUE}[SETUP]${RESET} $1"; }
success(){ echo -e "${GREEN}[OK]${RESET} $1"; }
warn()   { echo -e "${YELLOW}[WARN]${RESET} $1"; }
error()  { echo -e "${RED}[ERROR]${RESET} $1"; exit 1; }

BASE="/var/www/html/lsc_marketing_automation"
cd "$BASE"

# ─────────────────────────────────────────────────────────────
log "Checking prerequisites..."
# ─────────────────────────────────────────────────────────────

command -v node >/dev/null 2>&1 || error "Node.js not found"
command -v psql >/dev/null 2>&1 || error "PostgreSQL client not found"
command -v redis-cli >/dev/null 2>&1 || error "Redis CLI not found"

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  error "Node.js 18+ required (found v$NODE_VERSION)"
fi
success "Prerequisites OK (Node.js v$(node -v))"

# ─────────────────────────────────────────────────────────────
log "Setting up environment..."
# ─────────────────────────────────────────────────────────────

if [ ! -f ".env" ]; then
  cp .env.example .env
  warn ".env created from template — fill in ANTHROPIC_API_KEY and DB credentials before starting"
else
  success ".env already exists"
fi

# ─────────────────────────────────────────────────────────────
log "Creating log directory..."
# ─────────────────────────────────────────────────────────────
mkdir -p /var/log/lsc
success "Log directory: /var/log/lsc"

# ─────────────────────────────────────────────────────────────
log "Installing orchestrator dependencies..."
# ─────────────────────────────────────────────────────────────
cd "$BASE/orchestrator"
npm install --production
success "Orchestrator dependencies installed"

# ─────────────────────────────────────────────────────────────
log "Setting up PostgreSQL database..."
# ─────────────────────────────────────────────────────────────
cd "$BASE"
source .env 2>/dev/null || true

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-lsc_marketing}"
DB_USER="${DB_USER:-lsc_user}"
DB_PASSWORD="${DB_PASSWORD:-lsc_password}"

# Create user and database
psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c "
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
      CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
    END IF;
  END\$\$;
" 2>/dev/null || warn "Could not create DB user (may already exist)"

psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c "
  SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')
" | grep -q "CREATE DATABASE" && \
psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || true

# Apply schema
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -f "$BASE/database/schema.sql" && success "Schema applied" || warn "Schema may already be applied"

# ─────────────────────────────────────────────────────────────
log "Verifying Redis connection..."
# ─────────────────────────────────────────────────────────────
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping | grep -q "PONG" && success "Redis OK" || error "Redis not reachable"

# ─────────────────────────────────────────────────────────────
log "Installing dashboard dependencies (optional)..."
# ─────────────────────────────────────────────────────────────
if command -v npm >/dev/null 2>&1; then
  cd "$BASE/dashboard"
  npm install 2>/dev/null && success "Dashboard dependencies installed" || warn "Dashboard install failed — run manually"
fi

# ─────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════${RESET}"
echo -e "${GREEN}  LSC Platform Setup Complete!${RESET}"
echo -e "${GREEN}════════════════════════════════════════${RESET}"
echo ""
echo "  Next steps:"
echo "  1. Edit .env → add ANTHROPIC_API_KEY"
echo "  2. Start orchestrator: cd orchestrator && node server.js"
echo "  3. Start workers:      cd orchestrator && node queues/worker-runner.js"
echo "  4. Start dashboard:    cd dashboard && npm run dev"
echo ""
echo "  Or use Docker:"
echo "  docker-compose up -d"
echo ""
echo "  Endpoints:"
echo "  Dashboard:  http://localhost:3000"
echo "  API:        http://localhost:3001"
echo "  BullMQ UI:  http://localhost:3002"
echo ""
