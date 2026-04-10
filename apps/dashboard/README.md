# apps/dashboard

A React SPA that displays notification delivery metrics and activity. It polls the API server for summary counts and recent notifications, auto-refreshing every 30 seconds. Built with Vite, React 19, TanStack React Query, and React Router.

## Run locally

```bash
npm run dev --workspace=@notifyengine/dashboard
```

Opens on `http://localhost:5173`.

## Environment variables

Defined in `apps/dashboard/.env` (Vite injects `VITE_`-prefixed vars at build time):

| Variable | Default | Used in |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3000` | `src/services/notificationService.ts` — API server origin |
| `VITE_API_KEY` | (none) | `src/services/notificationService.ts` — Bearer token for API requests |

`VITE_API_KEY` must contain a valid API key from the `api_keys` table. After every database wipe and reseed, the key changes — copy the new key from the seed script output into `.env` and restart the dev server.

## Pages

| Route | Component | Description |
|---|---|---|
| `/` | — | Redirects to `/dashboard` |
| `/dashboard` | `Dashboard.tsx` | Summary stats cards + recent notifications table |
| `/notifications` | `Notifications.tsx` | Notification list view |
| `/tenants` | `Tenants.tsx` | Tenant management |
| `/settings` | `Settings.tsx` | Settings page |

## API calls

All requests go through `src/services/notificationService.ts` with `Authorization: Bearer ${VITE_API_KEY}`:

- `fetchNotificationSummary()` — `GET /v1/notifications/summary`
- `fetchRecentNotifications()` — `GET /v1/notifications?limit=20`

React Query is configured with a 30-second refetch interval and 20-second stale time (`src/main.tsx`).

## Dependencies on other services

- **API server** — the only backend the dashboard talks to (never connects to PostgreSQL, Redis, or ml-service directly)
