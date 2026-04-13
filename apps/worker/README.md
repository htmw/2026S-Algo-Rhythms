# apps/worker

The worker consumes notifications from priority-segmented BullMQ queues, determines the delivery channel (via ML adaptive routing, static priority, or forced override), delivers through the selected channel, records delivery attempts with feature vectors, and moves exhausted jobs to the dead-letter queue. It also runs a repeatable BullMQ job that triggers ML model retraining every 6 hours.

## Run locally

```bash
# Prerequisites: PostgreSQL, Redis, ml-service, and Mailpit running (docker compose up -d)
# Migrations applied and seed data loaded

export $(grep -v '^#' .env | xargs) && npm run dev --workspace=@notifyengine/worker
```

## Environment variables

| Variable | Default | Used in |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | `src/index.ts` — BullMQ worker connections |
| `DATABASE_URL` | (required) | `src/db.ts` — PostgreSQL pool |
| `ML_SERVICE_URL` | `http://localhost:8000` | `src/mlClient.ts` — adaptive routing predictions |
| `SMTP_HOST` | `localhost` | `src/channels/email.ts` — nodemailer transport |
| `SMTP_PORT` | `1025` | `src/channels/email.ts` — nodemailer transport |
| `SMTP_USER` | (empty) | `src/channels/email.ts` — optional SMTP auth |
| `SMTP_PASS` | (empty) | `src/channels/email.ts` — optional SMTP auth |
| `SMTP_FROM` | `noreply@notifyengine.dev` | `src/channels/email.ts` — sender address |
| `LOG_LEVEL` | `info` | `src/logger.ts` — Pino log level |
| `NODE_ENV` | (none) | `src/logger.ts` — controls Pino transport |

## BullMQ queues and job types

| Queue name | Concurrency | Purpose |
|---|---|---|
| `notifications-critical` | 20 | Critical priority notifications |
| `notifications-high` | 10 | High priority notifications |
| `notifications-standard` | 5 | Standard priority notifications |
| `notifications-bulk` | 2 | Bulk/low priority notifications |
| `notifications-dlq` | — | Dead-letter queue for exhausted retries |
| `ml-retrain` | — | Repeatable job: retrain ML model every 6 hours |
| `stats-rollup` | — | Defined in constants but not yet implemented |

**Job data shape** (`NotificationJob` from `@notifyengine/shared`):

```
notificationId  string
tenantId        string
recipient       string
priority        'critical' | 'high' | 'standard' | 'bulk'
routingMode     'adaptive' | 'static' | 'forced'
channelPreference?  string[]
forceChannel?       string
```

**Retry configuration** (per priority):

| Priority | Attempts | Backoff |
|---|---|---|
| critical | 5 | exponential, 1 000 ms base |
| high | 4 | exponential, 2 000 ms base |
| standard | 3 | exponential, 5 000 ms base |
| bulk | 2 | exponential, 30 000 ms base |

## Notification processing pipeline

Defined in `src/processor.ts`. Steps for each dequeued job:

1. **Acquire DB client** — get a `PoolClient`, set RLS context with `set_config('app.current_tenant_id', tenantId, false)`.
2. **Update status** — set notification status to `processing`.
3. **Fetch notification content** — read `recipient`, `subject`, `body`, `body_html` from `notifications` table.
4. **Resolve routing mode** — forced > job.routingMode (default: static).
5. **Fetch eligible channels** — query `channels` table filtered by `tenant_id`, `is_enabled = true`, `circuit_state = 'closed'`. If forced mode, filter to the forced channel type. Fail notification if no channels available.
6. **Fetch recipient stats** — query `recipient_channel_stats` for this recipient/tenant to get historical engagement data per channel.
7. **Extract feature vectors** — call `extractFeatures()` from `src/features.ts` for each eligible channel. Produces a 14-feature vector per channel.
8. **Make routing decision**:
   - **Forced** — use the forced channel directly.
   - **Static** — order channels by priority (and optional `channelPreference`).
   - **Adaptive** — call `POST /predict` on ml-service with feature vectors and `exploration_rate = 0.1`. If ml-service is unreachable or returns an error, fall back to static routing.
9. **Persist routing decision** — store the decision as JSONB on the notification row.
10. **Deliver sequentially** — iterate through ordered channels. For each:
    - Record `started_at`.
    - Call the delivery function (currently only `deliverEmail()` in `src/channels/email.ts`; other channel types log "not yet implemented" and skip).
    - Insert a `delivery_attempts` row with the feature vector snapshot.
    - On success: update notification to `delivered`, set `delivered_via` and `delivered_at`, return.
    - On failure: log and try next channel.
11. **All channels exhausted** — update notification to `failed`, set `failed_at`, throw error (triggers BullMQ retry). After max retries, `index.ts` moves the job to the DLQ and updates status to `dlq`.

## Adaptive routing integration

`src/mlClient.ts` — `predictChannel()`:

- Sends `POST ${ML_SERVICE_URL}/predict` with recipient, available channels, features per channel, and exploration rate.
- 2 000 ms timeout via `AbortController`.
- Returns the ml-service response (`{ selected, predictions, exploration, reason, model_version }`) or `null` on any failure (timeout, non-2xx, malformed response).
- When `null`, the processor falls back to static routing.

## ML retrain scheduler

`src/retrainScheduler.ts` — SCRUM-164:

- Registers a repeatable BullMQ job named `retrain-global-model` on the `ml-retrain` queue with a 6-hour interval.
- When the job fires, sends `POST ${ML_SERVICE_URL}/train` with `{ tenant_id: null }` (global model).
- Logs whether the new model was promoted (AUC improved) or rejected.
- Idempotent: safe to register on every worker startup.

## Dependencies on other services

- **PostgreSQL** — notifications, delivery_attempts, channels, recipient_channel_stats
- **Redis** — BullMQ job consumption and DLQ
- **ml-service** — adaptive routing predictions (`/predict`) and retraining (`/train`)
- **Mailpit** — receives email deliveries in dev via SMTP on port 1025
