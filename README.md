# NotifyEngine

Multi-tenant notification delivery service with ML-powered adaptive channel routing. NotifyEngine accepts notification requests via a REST API, routes them across email, SMS, WebSocket, and webhook channels, and uses an XGBoost engagement prediction model to learn which channel works best for each recipient. An AI content classifier categorizes each notification (security, marketing, transactional, social, operational) to improve routing decisions, and a circuit breaker protects downstream channels from cascading failures.

## Prerequisites

- **Node.js 20+** (includes npm)
- **Docker Desktop** (for PostgreSQL, Redis, Mailpit, ML service)
- **Anthropic API key** (optional -- see `.env.example` comment for setup)

## Getting Started

### 1. Clone the repo

```bash
git clone git@github.com:htmw/2026S-Algo-Rhythms.git
cd 2026S-Algo-Rhythms
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create your environment file

```bash
cp .env.example .env
```

For AI content classification and engagement simulation, add your Anthropic API key to the root `.env` file (see the comment in `.env.example`). Without it the system still works -- those features are skipped gracefully.

### 4. Start infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL (5432), Redis (6379), Mailpit (SMTP 1025, UI 8025), and the ML service (8000).

### 5. Run database migrations

```bash
export $(grep -v '^#' .env | grep -v '^$' | xargs) && npx tsx infra/migrate.ts
```

### 6. Seed test data

```bash
export $(grep -v '^#' .env | grep -v '^$' | xargs) && npx tsx infra/seed/devSeed.ts
```

Save the API keys printed to the console. They are shown once and never stored.

## Running Services

Open a separate terminal for each:

**API server** (port 3000):
```bash
export $(grep -v '^#' .env | grep -v '^$' | xargs) && npm run dev --workspace=@notifyengine/api
```

**Worker** (processes notification queue):
```bash
export $(grep -v '^#' .env | grep -v '^$' | xargs) && npm run dev --workspace=@notifyengine/worker
```

**Dashboard** (port 5173):

Create `apps/dashboard/.env` with an API key from tenant registration or the seed output:
```
VITE_API_URL=http://localhost:3000
VITE_API_KEY=ne_test_your_key_here
```
Then start:
```bash
npm run dev --workspace=@notifyengine/dashboard
```

**Mailpit UI** (view sent emails): [http://localhost:8025](http://localhost:8025)

## Key Features

### Adaptive Channel Routing

The ML service trains an XGBoost model on delivery and engagement outcomes. When `routing_mode` is set to `adaptive`, the system predicts which channel will maximize engagement for each recipient based on historical data, time of day, content category, and channel health.

### AI Content Classification

Each notification's subject and body are classified into a category (security, marketing, transactional, social, operational) using the Anthropic Claude API. The classification feeds into routing features -- urgency score, time sensitivity, and sentiment -- so the ML model can make content-aware decisions. Requires an Anthropic API key.

### Circuit Breaker

Per-channel circuit breakers in the worker track failure rates and transition through closed, open, and half-open states. When a channel's failure rate exceeds the threshold the breaker opens, preventing further delivery attempts until the channel recovers. State changes are broadcast to the dashboard in real time.

### Engagement Simulation

When an Anthropic API key is configured, the worker uses Claude to simulate whether a recipient would engage with a delivered notification based on persona, channel, and content. This generates synthetic engagement data for the ML model to learn from during development without requiring real user interactions.

### Real-Time Dashboard Events

The API server runs a Socket.IO namespace that streams delivery completions, circuit breaker state changes, engagement events, model retraining, and DLQ entries to the dashboard via Redis pub/sub.

### Simulation Control Panel

The dashboard includes a simulation page where you can launch predefined notification scenarios (security blast, marketing wave, etc.) across multiple personas and trigger model retraining -- useful for demonstrating the adaptive learning loop.

### Data Transparency Page

A dashboard page that surfaces ML model metrics, per-recipient routing intelligence, a static-vs-adaptive engagement comparison chart, and a full notification audit log. Designed to show how and why routing decisions are made.

## Testing the API

### Health check

```bash
curl http://localhost:3000/health
```

Expected: `{"status":"ok"}`

### Register a tenant

This creates a tenant with an API key and default channels. You can also use a key from the seed output.

```bash
curl -X POST http://localhost:3000/v1/tenants/register \
  -H "Content-Type: application/json" \
  -d '{"company_name": "My Company"}'
```

Expected: `201 Created` with `tenant_id`, `api_key`, and `slug`. Save the API key -- it is shown once and never stored.

Replace `YOUR_API_KEY` with the key from registration or seed output in all commands below.

### Send a notification

```bash
curl -X POST http://localhost:3000/v1/notifications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "recipient": "user@example.com",
    "subject": "Test notification",
    "body": "Hello from NotifyEngine!",
    "priority": "standard",
    "routing_mode": "adaptive"
  }'
```

Expected: `202 Accepted` with notification ID and status URL.

### Get notification status

```bash
curl http://localhost:3000/v1/notifications/NOTIFICATION_ID \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Expected: `200 OK` with notification details, delivery attempts, and routing decision.

### List notifications (cursor pagination)

```bash
curl "http://localhost:3000/v1/notifications?limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Expected: `200 OK` with `data` array and `pagination` object (`nextCursor`, `hasNextPage`, `limit`).

### Notification summary

```bash
curl http://localhost:3000/v1/notifications/summary \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Expected: `200 OK` with counts: `total`, `delivered`, `failed`, `queued`, `processing`.

### Email open tracking

After a notification is delivered, simulate the tracking pixel being loaded:

```bash
curl "http://localhost:3000/v1/engagement/track?nid=NOTIFICATION_ID"
```

Expected: `200` with a 1x1 transparent GIF. The delivery attempt's `engaged` field is set to `true`.

### Run a simulation scenario

```bash
curl -X POST http://localhost:3000/v1/simulation/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"scenario": "security_blast"}'
```

Expected: `200 OK` with a list of enqueued notification IDs.

### Trigger model retraining

```bash
curl -X POST http://localhost:3000/v1/simulation/retrain \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Expected: `200 OK` with the training result from the ML service.

### Get routing model info

```bash
curl http://localhost:3000/v1/routing/model \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Expected: `200 OK` with current model version, AUC, feature count, and training sample size.

### Get model training history

```bash
curl http://localhost:3000/v1/routing/model/history \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Expected: `200 OK` with an array of past model versions and their metrics.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (no auth) |
| `POST` | `/v1/tenants/register` | Register a tenant (no auth) |
| `POST` | `/v1/notifications` | Send a notification |
| `GET` | `/v1/notifications` | List notifications (cursor pagination) |
| `GET` | `/v1/notifications/summary` | Notification count summary |
| `GET` | `/v1/notifications/:id` | Get notification status |
| `GET` | `/v1/engagement/track` | Email open tracking pixel (no auth) |
| `GET` | `/v1/routing/model` | Current ML model info |
| `GET` | `/v1/routing/model/history` | Model training history |
| `GET` | `/v1/routing/recipients` | List recipients with routing data |
| `GET` | `/v1/routing/recipients/:recipient/engagement` | Recipient engagement history |
| `GET` | `/v1/routing/engagement-comparison` | Static vs adaptive comparison |
| `GET` | `/v1/model/info` | ML service model metadata |
| `GET` | `/v1/model/features` | ML model feature definitions |
| `POST` | `/v1/simulation/run` | Run a simulation scenario |
| `POST` | `/v1/simulation/retrain` | Trigger ML model retraining |

All endpoints except `/health`, `/v1/tenants/register`, and `/v1/engagement/track` require an `Authorization: Bearer <API_KEY>` header.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://notify:notify@localhost:5432/notifyengine` |
| `POSTGRES_USER` | PostgreSQL user (used by Docker) | `notify` |
| `POSTGRES_PASSWORD` | PostgreSQL password (used by Docker) | `notify` |
| `POSTGRES_DB` | PostgreSQL database name (used by Docker) | `notifyengine` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `REDIS_PUBSUB_URL` | Dedicated Redis pub/sub connection for dashboard events | `redis://localhost:6379` |
| `ML_SERVICE_URL` | ML prediction service URL | `http://localhost:8000` |
| `PORT` | API server port | `3000` |
| `NODE_ENV` | Node environment | `development` |
| `WEBHOOK_HMAC_SECRET` | HMAC secret for webhook signatures | Must be changed |
| `SMTP_HOST` | SMTP server host | `localhost` |
| `SMTP_PORT` | SMTP server port | `1025` |
| `SMTP_USER` | SMTP username | Empty (Mailpit needs none) |
| `SMTP_PASS` | SMTP password | Empty (Mailpit needs none) |
| `SMS_PROVIDER` | SMS provider (mock for dev) | `mock` |
| `DASHBOARD_URL` | Dashboard URL (used for CORS) | `http://localhost:5173` |
| `LOG_LEVEL` | Pino log level | `debug` |

## Dashboard Pages

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/dashboard` | Overview stats, live event feed, notification counts |
| Notifications | `/notifications` | Full notification list with compose form |
| Routing Intelligence | `/routing` | ML model metrics, recipient engagement data, feature importance |
| Simulation | `/simulation` | Launch scenarios, trigger retraining, view results |
| Data Transparency | `/transparency` | Model metrics, audit log, static vs adaptive comparison, recipient intelligence |
| Tenants | `/tenants` | Tenant management |
| Settings | `/settings` | Configuration |

## Project Structure

```
notifyengine/
├── apps/
│   ├── api/              # Express API server + Socket.IO (TypeScript)
│   ├── worker/           # BullMQ queue workers + circuit breaker (TypeScript)
│   ├── ml-service/       # Python FastAPI ML prediction + training service
│   └── dashboard/        # React admin dashboard (TypeScript + Vite)
├── packages/
│   └── shared/           # Shared types, constants, and socket event definitions
├── infra/
│   ├── migrations/       # PostgreSQL migrations (numbered, sequential)
│   ├── seed/             # Database seed scripts
│   └── migrate.ts        # Migration runner
├── scripts/              # Dev helper and verification scripts
├── docker-compose.yml    # Dev infrastructure (Postgres, Redis, Mailpit, ML)
├── turbo.json            # Turborepo pipeline config
├── tsconfig.base.json    # Shared TypeScript config
├── eslint.config.js      # ESLint flat config
├── .env.example          # Environment variable template
├── package.json          # Root workspace config
└── README.md
```
