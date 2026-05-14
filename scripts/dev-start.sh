#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── Load environment ──
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [ -f apps/dashboard/.env ]; then
  set -a
  # shellcheck disable=SC1091
  source apps/dashboard/.env
  set +a
fi

# ── Kill stale processes on ports 3000 and 3001 ──
for port in 3000 3001; do
  pid=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "Killing existing process on port $port (PID $pid)"
    kill -9 $pid 2>/dev/null || true
  fi
done

# ── Start infrastructure ──
echo "Starting Docker infrastructure..."
docker compose up -d

# ── Wait for Postgres ──
echo -n "Waiting for Postgres..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U notify -d notifyengine >/dev/null 2>&1; then
    echo " ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo " FAILED (timeout after 30s)"
    exit 1
  fi
  sleep 1
  echo -n "."
done

# ── Wait for Redis ──
echo -n "Waiting for Redis..."
for i in $(seq 1 30); do
  if docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
    echo " ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo " FAILED (timeout after 30s)"
    exit 1
  fi
  sleep 1
  echo -n "."
done

# ── Run migrations ──
echo "Running database migrations..."
npx tsx infra/migrate.ts

# ── Start API server ──
API_LOG="/tmp/notifyengine-api.log"
echo "Starting API server (log: $API_LOG)..."
npm run dev --workspace=@notifyengine/api > "$API_LOG" 2>&1 &

# ── Start worker ──
WORKER_LOG="/tmp/notifyengine-worker.log"
echo "Starting worker (log: $WORKER_LOG)..."
npm run dev --workspace=@notifyengine/worker > "$WORKER_LOG" 2>&1 &

# ── Wait for API health check ──
API_PORT="${PORT:-3000}"
echo -n "Waiting for API health check on port $API_PORT..."
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
    echo " healthy"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo " FAILED (timeout after 30s)"
    echo "Check $API_LOG for errors"
    exit 1
  fi
  sleep 1
  echo -n "."
done

echo ""
echo "All services running"
echo "  API log:    $API_LOG"
echo "  Worker log: $WORKER_LOG"
