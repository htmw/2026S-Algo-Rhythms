# NotifyEngine

Multi-tenant notification delivery service with ML-powered adaptive channel routing. NotifyEngine accepts notification requests via a REST API, routes them across email, SMS, WebSocket, and webhook channels, and uses an XGBoost engagement prediction model to learn which channel works best for each recipient.

## Prerequisites

- **Node.js 20+** (includes npm)
- **Docker Desktop** (for PostgreSQL, Redis, Mailpit, ML service)

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
VITE_API_BASE_URL=http://localhost:3000
VITE_API_KEY=ne_test_your_key_here
```
Then start:
```bash
npm run dev --workspace=@notifyengine/dashboard
```

**Mailpit UI** (view sent emails): [http://localhost:8025](http://localhost:8025)

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

Expected: `201 Created` with `tenant_id`, `api_key`, and `slug`. Save the API key — it is shown once and never stored.

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

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://notify:notify@localhost:5432/notifyengine` |
| `POSTGRES_USER` | PostgreSQL user (used by Docker) | `notify` |
| `POSTGRES_PASSWORD` | PostgreSQL password (used by Docker) | `notify` |
| `POSTGRES_DB` | PostgreSQL database name (used by Docker) | `notifyengine` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
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

## Project Structure

```
notifyengine/
├── apps/
│   ├── api/              # Node.js Express API server (TypeScript)
│   ├── worker/           # Node.js BullMQ queue workers (TypeScript)
│   ├── ml-service/       # Python FastAPI ML prediction service
│   └── dashboard/        # React admin dashboard (TypeScript + Vite)
├── packages/
│   └── shared/           # Shared TypeScript types + constants
├── infra/
│   ├── migrations/       # PostgreSQL migrations (numbered, sequential)
│   ├── seed/             # Database seed scripts
│   └── migrate.ts        # Migration runner
├── docker-compose.yml    # Dev infrastructure (Postgres, Redis, Mailpit, ML)
├── turbo.json            # Turborepo pipeline config
├── tsconfig.base.json    # Shared TypeScript config
├── eslint.config.js      # ESLint flat config
├── .env.example          # Environment variable template
├── package.json          # Root workspace config
└── README.md
```
