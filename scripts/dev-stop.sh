#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── Kill processes on ports 3000 and 3001 ──
for port in 3000 3001; do
  pid=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "Killing process on port $port (PID $pid)"
    kill -9 $pid 2>/dev/null || true
  fi
done

# ── Stop Docker infrastructure ──
echo "Stopping Docker infrastructure..."
docker compose down

echo "All services stopped"
