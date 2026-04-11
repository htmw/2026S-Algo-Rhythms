# apps/api

The API server is the HTTP entry point for NotifyEngine. It handles tenant registration, API key authentication, notification submission (enqueueing to BullMQ), cursor-paginated listing, email open tracking via a pixel endpoint, and real-time dashboard updates over Socket.IO. It never delivers notifications directly — that is the worker's job.

## Run locally

```bash
# Prerequisites: PostgreSQL, Redis, and Mailpit running (docker compose up -d)
# Migrations applied and seed data loaded

# Load env and start dev server
export $(grep -v '^#' .env | xargs) && npm run dev --workspace=@notifyengine/api
```

The server starts on `http://localhost:3000` by default.

## Environment variables

Read from `process.env` across the codebase:

| Variable | Default | Used in |
|---|---|---|
| `DATABASE_URL` | (none — set via `.env`) | `src/db.ts` — PostgreSQL connection pool. `.env.example` suggests `postgresql://notify:notify@localhost:5432/notifyengine` |
| `REDIS_URL` | `redis://localhost:6379` | `src/queue.ts`, `src/index.ts` — BullMQ queues and general Redis |
| `REDIS_PUBSUB_URL` | falls back to `REDIS_URL` | `src/index.ts` — isolated subscriber for dashboard bridge |
| `PORT` | `3000` | `src/index.ts` — Express listen port |
| `NODE_ENV` | (none) | `src/logger.ts` — when not `'production'`, uses `pino/file` transport to stdout (raw JSON, not pretty-printed). `src/routes/tenants.ts` — determines API key prefix (`ne_live_` in production, `ne_test_` otherwise) |
| `DASHBOARD_URL` | `http://localhost:5173` | `src/index.ts` — CORS origin for Express and Socket.IO |
| `LOG_LEVEL` | `info` | `src/logger.ts` — Pino log level |

## Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Returns `{ status: "ok" }` |
| POST | `/v1/tenants/register` | No | Register a tenant, returns raw API key (shown once) |
| POST | `/v1/notifications` | Yes | Submit a notification for async delivery (returns 202) |
| GET | `/v1/notifications` | Yes | List notifications with cursor pagination |
| GET | `/v1/notifications/summary` | Yes | Aggregated counts by status |
| GET | `/v1/notifications/:id` | Yes | Single notification with delivery attempts |
| GET | `/v1/engagement/track` | No | Email open tracking pixel (1x1 GIF), query param `nid` |
| WS | `/dashboard` | Yes (token in handshake) | Socket.IO namespace for real-time dashboard events |

Authentication uses `Authorization: Bearer <api_key>`. The auth middleware (`src/middleware/auth.ts`) hashes the key with SHA-256, looks it up in `api_keys`, validates expiry/revocation, then sets RLS tenant context on a dedicated `PoolClient` attached to the request.

## Dependencies on other services

- **PostgreSQL** — all persistent storage (tenants, api_keys, notifications, delivery_attempts, channels)
- **Redis** — BullMQ job enqueue (notification submission) and pub/sub subscriber for dashboard bridge
- **Worker** — consumes jobs enqueued by the API; without it notifications stay in `queued` status
- **Mailpit** — not called directly, but email delivery (via worker) lands here in dev
