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
```bash
npm run dev --workspace=@notifyengine/dashboard
```

**Mailpit UI** (view sent emails): [http://localhost:8025](http://localhost:8025)

## Testing the API

Replace `YOUR_API_KEY` with a key from the seed output.

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

Expected response: `202 Accepted` with notification ID and status URL.

### Get notification status

```bash
curl http://localhost:3000/v1/notifications/NOTIFICATION_ID \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Expected response: `200 OK` with notification details, routing decision, and delivery attempts.

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
