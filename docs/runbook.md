# Operational Runbook

## Start the full stack locally

### 1. Start Docker infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL (5432), Redis (6379), ml-service (8000), and Mailpit (SMTP 1025, UI 8025).

### 2. Set up environment

```bash
cp .env.example .env
# Edit .env if needed (defaults work for local dev)
```

### 3. Run migrations

```bash
export $(grep -v '^#' .env | xargs) && npx tsx infra/migrate.ts
```

### 4. Seed the database

```bash
export $(grep -v '^#' .env | xargs) && npx tsx infra/seed/devSeed.ts
```

Save the API keys printed to the console — they are shown once and stored only as hashes.

### 5. Start Node services (separate terminals)

```bash
# API server
export $(grep -v '^#' .env | xargs) && npm run dev --workspace=@notifyengine/api

# Worker
export $(grep -v '^#' .env | xargs) && npm run dev --workspace=@notifyengine/worker

# Dashboard
npm run dev --workspace=@notifyengine/dashboard
```

### 6. Update dashboard API key

Copy one of the API keys from step 4 into `apps/dashboard/.env`:

```
VITE_API_BASE_URL=http://localhost:3000
VITE_API_KEY=ne_test_<key from seed output>
```

Restart the dashboard dev server after editing.

---

## Register a tenant and get an API key

```bash
curl -s -X POST http://localhost:3000/v1/tenants/register \
  -H 'Content-Type: application/json' \
  -d '{"company_name": "My Company"}' | jq .
```

The response includes `api_key` — save it immediately. It is returned once and stored as a SHA-256 hash.

---

## Send a test notification end to end

```bash
curl -s -X POST http://localhost:3000/v1/notifications \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your_api_key>' \
  -d '{
    "recipient": "test@example.com",
    "subject": "Hello",
    "body": "Test notification body",
    "priority": "standard",
    "routing_mode": "static"
  }' | jq .
```

Expected: `202 Accepted` with a notification ID.

To verify delivery:

1. Check notification status: `curl -s http://localhost:3000/v1/notifications/<id> -H 'Authorization: Bearer <key>' | jq .`
2. Check Mailpit UI at `http://localhost:8025` for the delivered email.
3. Check worker logs for delivery attempt output.

---

## Wipe and reseed the database

```bash
# Drop and recreate the database
docker compose exec postgres psql -U notify -d postgres -c "DROP DATABASE IF EXISTS notifyengine;"
docker compose exec postgres psql -U notify -d postgres -c "CREATE DATABASE notifyengine;"

# Re-run migrations and seed
export $(grep -v '^#' .env | xargs) && npx tsx infra/migrate.ts
export $(grep -v '^#' .env | xargs) && npx tsx infra/seed/devSeed.ts
```

After reseeding, update `VITE_API_KEY` in `apps/dashboard/.env` with the new key from seed output and restart the dashboard.

---

## Check BullMQ queue depth via Redis CLI

```bash
# Connect to Redis
docker compose exec redis redis-cli

# Check waiting jobs per queue
LLEN bull:notifications-critical:wait
LLEN bull:notifications-high:wait
LLEN bull:notifications-standard:wait
LLEN bull:notifications-bulk:wait
LLEN bull:notifications-dlq:wait

# Check active (in-progress) jobs
LLEN bull:notifications-standard:active

# Check completed count
LLEN bull:notifications-standard:completed

# Check failed count
LLEN bull:notifications-standard:failed

# List all BullMQ keys
KEYS bull:*
```

---

## Trigger an ML training run

### Via curl (manual)

```bash
curl -s -X POST http://localhost:8000/train \
  -H 'Content-Type: application/json' \
  -d '{"tenant_id": null}' | jq .
```

Response shows `promoted: true/false`, the model version, and training metrics.

### Via the worker scheduler

The worker automatically triggers `POST /train` every 6 hours via a repeatable BullMQ job on the `ml-retrain` queue. This starts as soon as the worker process starts.

### Seed synthetic training data

```bash
docker compose exec ml-service python -m synthetic --output data/training.csv --users 50 --notifications 200
```

---

## Verify service connectivity

### PostgreSQL

```bash
docker compose exec postgres pg_isready -U notify -d notifyengine
# Expected: /var/run/postgresql:5432 - accepting connections

# Or from host
psql postgresql://notify:notify@localhost:5432/notifyengine -c "SELECT 1;"
```

### Redis

```bash
docker compose exec redis redis-cli ping
# Expected: PONG
```

### Mailpit

Open `http://localhost:8025` in a browser. The inbox should load (empty is fine). To test SMTP:

```bash
# Quick SMTP test
echo -e "Subject: Test\n\nHello" | curl smtp://localhost:1025 --mail-from test@test.com --mail-rcpt inbox@test.com -T -
```

### ml-service

```bash
curl -s http://localhost:8000/health | jq .
# Expected: { "status": "ok", "model_loaded": true }
```

---

## Read structured Pino logs

The API and worker emit JSON-structured Pino logs to stdout. In development, Pino uses a file transport to stdout (not pretty-printed by default).

To read logs with formatting:

```bash
# Pipe through pino-pretty (install globally if needed: npm i -g pino-pretty)
export $(grep -v '^#' .env | xargs) && npm run dev --workspace=@notifyengine/api | npx pino-pretty

# Filter by log level
export $(grep -v '^#' .env | xargs) && npm run dev --workspace=@notifyengine/api | npx pino-pretty -L info

# Search for a specific notification
export $(grep -v '^#' .env | xargs) && npm run dev --workspace=@notifyengine/api | npx pino-pretty | grep '<notification_id>'
```

Key fields in structured logs: `tenantId`, `notificationId`, `requestId`, `channel`, `jobId`, `queue`.

---

## Common failure modes and fixes

### Missing .env file

**Symptom**: `Error: connect ECONNREFUSED 127.0.0.1:5432` or undefined env var errors on startup.

**Fix**: Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### Port conflicts

**Symptom**: `EADDRINUSE` or Docker bind errors.

**Fix**: Check what is using the port and stop it:
```bash
lsof -i :3000   # API
lsof -i :5432   # PostgreSQL
lsof -i :6379   # Redis
lsof -i :8000   # ml-service
lsof -i :5173   # Dashboard
lsof -i :1025   # Mailpit SMTP
```

### Docker network issues

**Symptom**: ml-service cannot reach PostgreSQL, or containers can't communicate.

**Fix**: Ensure all services are on the `notifyengine` network:
```bash
docker compose down && docker compose up -d
docker network inspect notifyengine_notifyengine
```

### ml-service returns 503 on /predict

**Symptom**: Worker falls back to static routing on every request.

**Fix**: Check ml-service health and logs:
```bash
curl http://localhost:8000/health
docker compose logs ml-service --tail 50
```

If `model_loaded: false`, the bootstrap failed. Restart the container:
```bash
docker compose restart ml-service
```

### Dashboard shows no data

**Symptom**: All counts are 0 or API errors in browser console.

**Fix**:
1. Check that `VITE_API_KEY` in `apps/dashboard/.env` matches a valid key in the database.
2. After any database wipe, the old key is invalid — reseed and copy the new key.
3. Restart the dashboard dev server after changing `.env`.

### Notifications stuck in "queued" status

**Symptom**: Notifications are created but never delivered.

**Fix**: The worker is not running. Start it:
```bash
export $(grep -v '^#' .env | xargs) && npm run dev --workspace=@notifyengine/worker
```

### Migrations fail

**Symptom**: `error: relation "X" already exists` or migration runner exits with code 1.

**Fix**: The `_migrations` tracking table may be out of sync. Check applied migrations:
```bash
psql postgresql://notify:notify@localhost:5432/notifyengine -c "SELECT * FROM _migrations ORDER BY applied_at;"
```

If the database is in a bad state, wipe and reseed (see above).

### Redis connection refused

**Symptom**: `Error: connect ECONNREFUSED 127.0.0.1:6379` from API or worker.

**Fix**:
```bash
docker compose up -d redis
docker compose exec redis redis-cli ping
```
