#!/usr/bin/env bash
# team-setup.sh — One-command dev environment setup for NotifyEngine
# Usage: bash scripts/team-setup.sh
set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

step=0
step() {
  step=$((step + 1))
  echo -e "\n${BLUE}[$step]${NC} ${BOLD}$1${NC}"
}

info()    { echo -e "    ${CYAN}→${NC} $1"; }
success() { echo -e "    ${GREEN}✔${NC} $1"; }
warn()    { echo -e "    ${YELLOW}⚠${NC} $1"; }
fail()    { echo -e "    ${RED}✖ $1${NC}"; exit 1; }

# ── Resolve repo root (script lives in scripts/) ───────────────────
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── Step 1: Check prerequisites ────────────────────────────────────
step "Checking prerequisites"

missing=()
for cmd in node npm docker; do
  if command -v "$cmd" &>/dev/null; then
    ver=$("$cmd" --version 2>/dev/null || echo "unknown")
    success "$cmd $ver"
  else
    missing+=("$cmd")
  fi
done

# docker compose (v2 plugin) check
if docker compose version &>/dev/null; then
  ver=$(docker compose version --short 2>/dev/null || echo "unknown")
  success "docker compose $ver"
else
  missing+=("docker compose (v2 plugin)")
fi

if [ ${#missing[@]} -gt 0 ]; then
  fail "Missing required tools: ${missing[*]}\n    Install them and re-run this script."
fi

# ── Step 2: Copy .env.example → .env ──────────────────────────────
step "Setting up .env"

if [ -f .env ]; then
  success ".env already exists — skipping copy"
else
  if [ ! -f .env.example ]; then
    fail ".env.example not found at repo root"
  fi
  cp .env.example .env
  success "Copied .env.example → .env"
fi

# Source env vars for later steps
set -a
# shellcheck disable=SC1091
source .env
set +a

# ── Step 3: Kill processes occupying required ports ────────────────
step "Freeing required ports (5432, 6379, 8000, 8025)"

for port in 5432 6379 8000 8025; do
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -z "$pids" ]; then
    info "Port $port is free"
    continue
  fi
  killed=()
  skipped=0
  for pid in $pids; do
    proc_name=$(ps -p "$pid" -o comm= 2>/dev/null || echo "")
    if echo "$proc_name" | grep -qiE 'com\.docker|docker-proxy|docker'; then
      skipped=$((skipped + 1))
    else
      kill -9 "$pid" 2>/dev/null || true
      killed+=("$pid($proc_name)")
    fi
  done
  if [ ${#killed[@]} -gt 0 ]; then
    success "Killed ${killed[*]} on port $port"
  fi
  if [ $skipped -gt 0 ]; then
    info "Skipped $skipped Docker process(es) on port $port — docker compose down will handle them"
  fi
  if [ ${#killed[@]} -eq 0 ] && [ $skipped -eq 0 ]; then
    info "Port $port is free"
  fi
done

# ── Step 4: Clean up stale Docker volumes ──────────────────────────
step "Tearing down stale containers and volumes"

docker compose down -v --remove-orphans 2>/dev/null || true
success "Docker environment cleaned"

# ── Step 5: Start infrastructure containers ────────────────────────
step "Starting infrastructure (postgres, redis, mailpit, ml-service)"

docker compose up -d
success "Containers started"

# ── Step 6: Wait for postgres to be healthy ────────────────────────
step "Waiting for Postgres to be healthy"

max_wait=60
elapsed=0
while [ $elapsed -lt $max_wait ]; do
  status=$(docker compose ps postgres --format json 2>/dev/null | grep -o '"Health":"[^"]*"' | head -1 || echo "")
  if echo "$status" | grep -qi "healthy"; then
    success "Postgres is healthy"
    break
  fi
  sleep 2
  elapsed=$((elapsed + 2))
  info "Waiting... (${elapsed}s/${max_wait}s)"
done

if [ $elapsed -ge $max_wait ]; then
  fail "Postgres did not become healthy within ${max_wait}s. Check: docker compose logs postgres"
fi

# ── Step 7: Run database migrations ───────────────────────────────
step "Running database migrations"

npx tsx infra/migrate.ts
success "Migrations complete"

# ── Step 8: Install npm dependencies ──────────────────────────────
step "Installing npm dependencies"

npm install
success "Dependencies installed"

# ── Step 9 & 10: Register tenant and write dashboard .env ─────────
step "Registering dev tenant and configuring dashboard"

API_PORT="${PORT:-3000}"
API_URL="http://localhost:$API_PORT"

# Start the API server in background
info "Starting API server temporarily..."
npx tsx apps/api/src/index.ts &
API_PID=$!

# Give the API a moment to boot
api_ready=false
for i in $(seq 1 30); do
  if curl -sf "$API_URL/health" >/dev/null 2>&1 || curl -sf "$API_URL/v1/tenants" >/dev/null 2>&1; then
    api_ready=true
    break
  fi
  # Also check if the process is still alive
  if ! kill -0 "$API_PID" 2>/dev/null; then
    fail "API server exited unexpectedly. Check logs above."
  fi
  sleep 1
done

if [ "$api_ready" = false ]; then
  # Try once more — some endpoints may 404 but the server is up
  if curl -sf -o /dev/null -w "%{http_code}" "$API_URL/v1/tenants/register" 2>/dev/null | grep -qE '4[0-9]{2}|200'; then
    api_ready=true
  fi
fi

if [ "$api_ready" = false ]; then
  kill "$API_PID" 2>/dev/null || true
  fail "API server did not start within 30s. Run manually to debug:\n    export \$(grep -v '^#' .env | xargs) && npx tsx apps/api/src/index.ts"
fi

success "API server running (PID $API_PID)"

# Register the tenant
info "Registering tenant 'NotifyEngine Dev'..."
REGISTER_RESPONSE=$(curl -sf -X POST "$API_URL/v1/tenants/register" \
  -H "Content-Type: application/json" \
  -d '{"company_name": "NotifyEngine Dev"}' 2>&1) || true

if echo "$REGISTER_RESPONSE" | grep -q '"api_key"'; then
  API_KEY=$(echo "$REGISTER_RESPONSE" | grep -o '"api_key":"[^"]*"' | cut -d'"' -f4)
  success "Tenant registered — API key obtained"
elif echo "$REGISTER_RESPONSE" | grep -q 'DUPLICATE_TENANT'; then
  warn "Tenant already exists — dashboard .env left unchanged"
  API_KEY=""
else
  warn "Tenant registration returned unexpected response — dashboard .env left unchanged"
  info "Response: $REGISTER_RESPONSE"
  API_KEY=""
fi

# Write dashboard .env
DASHBOARD_ENV="apps/dashboard/.env"
if [ -n "$API_KEY" ]; then
  cat > "$DASHBOARD_ENV" <<EOF
VITE_API_BASE_URL=http://localhost:$API_PORT
VITE_API_KEY=$API_KEY
EOF
  success "Wrote $DASHBOARD_ENV"
fi

# Stop the temporary API server
kill "$API_PID" 2>/dev/null || true
wait "$API_PID" 2>/dev/null || true
info "Temporary API server stopped"

# ── Summary ────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  Setup complete. To start developing:${NC}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${CYAN}API server:${NC}"
echo -e "    export \$(grep -v '^#' .env | xargs) && npm run dev --workspace=@notifyengine/api"
echo ""
echo -e "  ${CYAN}Worker:${NC}"
echo -e "    export \$(grep -v '^#' .env | xargs) && npm run dev --workspace=@notifyengine/worker"
echo ""
echo -e "  ${CYAN}Dashboard:${NC}"
echo -e "    npm run dev --workspace=@notifyengine/dashboard"
echo ""
echo -e "  ${CYAN}Mailpit UI:${NC}       http://localhost:8025"
echo -e "  ${CYAN}ML Service:${NC}       http://localhost:8000/health"
echo -e "  ${CYAN}Dashboard:${NC}        http://localhost:5173"
echo ""
