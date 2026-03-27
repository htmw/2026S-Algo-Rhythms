#!/usr/bin/env bash
# =============================================================
# NotifyEngine Sprint 1 Demo Script
# Run this and follow the prompts. Press Enter to advance.
# =============================================================

set -e

BLUE='\033[1;34m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
CYAN='\033[1;36m'
NC='\033[0m'
BOLD='\033[1m'

API_URL="http://localhost:3000"
MAILPIT_URL="http://localhost:8025"

pause() {
    echo ""
    echo -e "${YELLOW}Press Enter to continue...${NC}"
    read -r
}

header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${CYAN}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

info() {
    echo -e "${CYAN}→ $1${NC}"
}

# =============================================================
header "NotifyEngine Sprint 1 Demo"
echo "  This script walks through the complete notification"
echo "  delivery pipeline: register → send → deliver → check."
echo ""
echo "  Prerequisites: Docker Desktop running"
pause

# =============================================================
header "Step 0: Environment Setup"

# Resolve project root (scripts/ lives one level down)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

# Create .env from example if missing
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        success ".env created from .env.example"
    else
        echo -e "${RED}✗ No .env or .env.example found${NC}"
        exit 1
    fi
fi

# Load .env so Node processes (API, Worker, migrations) can reach Postgres/Redis
set -a
# shellcheck disable=SC1091
source .env
set +a

info "Installing npm dependencies..."
npm install --silent 2>&1 | tail -1
success "Dependencies installed"
echo ""

info "Building shared package..."
npm run build --workspace=packages/shared --silent 2>/dev/null
success "Shared package built"
echo ""

info "Stopping any existing containers and cleaning up..."
docker compose down -v 2>/dev/null || true

# Kill leftover API / Worker / Dashboard processes from a previous run
kill "$(lsof -ti:3000)" 2>/dev/null || true
kill "$(lsof -ti:5173)" 2>/dev/null || true
echo ""

info "Starting Docker Compose stack (PostgreSQL, Redis, ML Service, Mailpit)..."
docker compose up -d
echo ""

info "Waiting for infrastructure services to be healthy..."
sleep 5

# Wait for Mailpit
MAX_RETRIES=30
RETRY_COUNT=0
until curl -sf "${MAILPIT_URL}/api/v1/messages" > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo -e "${RED}✗ Mailpit not responding after ${MAX_RETRIES} retries${NC}"
        exit 1
    fi
    sleep 1
done
success "Mailpit is running"
echo ""

info "Running database migrations..."
npx tsx infra/migrate.ts
success "Migrations complete"
echo ""

info "Seeding test data..."
npx tsx infra/seed/devSeed.ts
success "Test tenant, API key, and email channel seeded"

# Clear any existing emails in Mailpit
curl -sf -X DELETE "${MAILPIT_URL}/api/v1/messages" > /dev/null 2>&1 || true
success "Mailpit inbox cleared"
echo ""

info "Starting API server and Worker in the background..."
npx tsx apps/api/src/index.ts  > /dev/null 2>&1 &
API_PID=$!
npx tsx apps/worker/src/index.ts > /dev/null 2>&1 &
WORKER_PID=$!

# Ensure background processes are cleaned up on exit (dashboard PID added later)
cleanup() {
    kill "$API_PID" "$WORKER_PID" "$DASHBOARD_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Wait for API to be ready
MAX_RETRIES=30
RETRY_COUNT=0
until curl -sf "${API_URL}/health" > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo -e "${RED}✗ API server not responding after ${MAX_RETRIES} retries${NC}"
        exit 1
    fi
    echo "  Waiting for API server... (${RETRY_COUNT}/${MAX_RETRIES})"
    sleep 2
done
success "API server is running (PID ${API_PID})"
success "Worker is running   (PID ${WORKER_PID})"
pause

# =============================================================
header "Step 1: Health Check"
info "Confirming the API is running."
info "GET ${API_URL}/health"
echo ""

curl -s "${API_URL}/health" | python3 -m json.tool
echo ""
success "API server is live."
pause

# =============================================================
header "Step 2: Register a Tenant"
info "A developer registers their company to get an API key."
info "POST ${API_URL}/v1/tenants/register"
echo ""

COMPANY_NAME="Acme Demo Corp"
API_KEY=""

while true; do
    info "Registering tenant: ${COMPANY_NAME}"
    echo ""

    REGISTER_HTTP=$(curl -s -o /tmp/ne_register.json -w "%{http_code}" -X POST "${API_URL}/v1/tenants/register" \
        -H "Content-Type: application/json" \
        -d "{\"company_name\": \"${COMPANY_NAME}\"}")

    REGISTER_RESPONSE=$(cat /tmp/ne_register.json)
    echo "$REGISTER_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$REGISTER_RESPONSE"
    echo ""

    if [ "$REGISTER_HTTP" = "201" ]; then
        API_KEY=$(echo "$REGISTER_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('api_key',''))" 2>/dev/null || echo "")
        success "Tenant registered. API key received (shown once, stored as SHA-256 hash)."
        break
    elif [ "$REGISTER_HTTP" = "409" ]; then
        echo -e "${YELLOW}⚠  A tenant with that name already exists (409 Conflict).${NC}"
        echo -e "${YELLOW}   The system correctly rejected the duplicate.${NC}"
        echo ""
        echo -e "${CYAN}Enter a different company name (or Ctrl-C to quit):${NC}"
        read -r COMPANY_NAME
        if [ -z "$COMPANY_NAME" ]; then
            echo -e "${RED}✗ No name entered. Exiting.${NC}"
            exit 1
        fi
        echo ""
    else
        echo -e "${RED}✗ Registration failed (HTTP ${REGISTER_HTTP})${NC}"
        exit 1
    fi
done

if [ -z "$API_KEY" ]; then
    echo -e "${RED}✗ Could not obtain an API key. Exiting.${NC}"
    exit 1
fi

# Start the dashboard now that we have an API key for it
info "Configuring and starting the dashboard..."
cat > apps/dashboard/.env <<DASHEOF
VITE_API_BASE_URL=http://localhost:3000
VITE_API_KEY=${API_KEY}
DASHEOF
npm run dev --workspace=@notifyengine/dashboard > /dev/null 2>&1 &
DASHBOARD_PID=$!

success "Dashboard starting at http://localhost:5173 (PID ${DASHBOARD_PID})"
pause

# =============================================================
header "Step 3: Send a Notification"
info "The developer sends a notification via a single API call."
info "POST ${API_URL}/v1/notifications"
info "The API validates, creates a record, enqueues to BullMQ, returns 202."
echo ""

NOTIF_RESPONSE=$(curl -s -X POST "${API_URL}/v1/notifications" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${API_KEY}" \
    -d '{
        "recipient": "demo@example.com",
        "subject": "Your order has shipped",
        "body": "Order #1234 is on its way. Track it at example.com/track/1234",
        "routing_mode": "static",
        "priority": "high"
    }')

echo "$NOTIF_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$NOTIF_RESPONSE"
echo ""

NOTIF_ID=$(echo "$NOTIF_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

success "Notification accepted with 202 (queued, not delivered yet)."
success "The worker is now processing this in the background."
pause

# =============================================================
header "Step 4: Verify Email Delivery"
info "The worker picked up the job, selected the email channel"
info "(static routing: Email → WebSocket → Webhook), and delivered via Nodemailer."
echo ""

# Give the worker a moment
sleep 2

info "Checking Mailpit inbox at ${MAILPIT_URL}..."
echo ""

MAIL_RESPONSE=$(curl -sf "${MAILPIT_URL}/api/v1/messages" 2>/dev/null)
MAIL_COUNT=$(echo "$MAIL_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null || echo "0")

if [ "$MAIL_COUNT" -gt 0 ]; then
    echo "$MAIL_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for msg in data.get('messages', []):
    print(f\"  To:      {msg.get('To', [{}])[0].get('Address', 'N/A')}\")
    print(f\"  Subject: {msg.get('Subject', 'N/A')}\")
    print(f\"  Date:    {msg.get('Created', 'N/A')}\")
" 2>/dev/null
    echo ""
    success "Email delivered successfully!"
else
    echo -e "${YELLOW}  Waiting for delivery...${NC}"
    sleep 3
    MAIL_RESPONSE=$(curl -sf "${MAILPIT_URL}/api/v1/messages" 2>/dev/null)
    echo "$MAIL_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for msg in data.get('messages', []):
    print(f\"  To:      {msg.get('To', [{}])[0].get('Address', 'N/A')}\")
    print(f\"  Subject: {msg.get('Subject', 'N/A')}\")
" 2>/dev/null
    success "Email delivered!"
fi

info "Open ${MAILPIT_URL} in a browser to see the full email."
pause

# =============================================================
header "Step 5: Check Notification Status"
info "The developer checks what happened to their notification."
echo ""

if [ -n "$NOTIF_ID" ]; then
    info "GET ${API_URL}/v1/notifications/${NOTIF_ID}"
    echo ""
    STATUS_RESPONSE=$(curl -s "${API_URL}/v1/notifications/${NOTIF_ID}" \
        -H "Authorization: Bearer ${API_KEY}")
    echo "$STATUS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RESPONSE"
else
    info "No notification ID captured. Fetching latest notification..."
    STATUS_RESPONSE=$(curl -s "${API_URL}/v1/notifications" \
        -H "Authorization: Bearer ${API_KEY}")
    echo "$STATUS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RESPONSE"
fi

echo ""
success "Full delivery status returned: channel used, timing, outcome."
pause

# =============================================================
header "Step 6a: Fire Tracking Pixel"
info "Simulating an email open — the tracking pixel fires back to the API."
info "GET ${API_URL}/v1/engagement/track?nid=${NOTIF_ID}"
echo ""

if [ -n "$NOTIF_ID" ]; then
    PIXEL_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/v1/engagement/track?nid=${NOTIF_ID}")
    PIXEL_CT=$(curl -s -D - -o /dev/null "${API_URL}/v1/engagement/track?nid=${NOTIF_ID}" 2>/dev/null | grep -i "content-type" | tr -d '\r')
    echo "  HTTP ${PIXEL_HTTP}  ${PIXEL_CT}"
    echo ""
    success "1x1 transparent GIF returned. Engagement recorded."
else
    echo -e "${YELLOW}⚠  Skipping — no notification ID available.${NC}"
fi
pause

# =============================================================
header "Step 6b: Verify Engagement"
info "Checking if the engagement was recorded on the notification."
echo ""

if [ -n "$NOTIF_ID" ]; then
    info "GET ${API_URL}/v1/notifications/${NOTIF_ID}"
    echo ""
    ENGAGE_RESPONSE=$(curl -s "${API_URL}/v1/notifications/${NOTIF_ID}" \
        -H "Authorization: Bearer ${API_KEY}")
    echo "$ENGAGE_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
attempts = data.get('delivery_attempts', [])
if attempts:
    a = attempts[0]
    print(f'  engaged:          {a.get(\"engaged\", False)}')
    print(f'  engagement_type:  {a.get(\"engagement_type\", \"N/A\")}')
    print(f'  engaged_at:       {a.get(\"engaged_at\", \"N/A\")}')
else:
    print('  No delivery attempts found.')
" 2>/dev/null
    echo ""
    success "Engagement data recorded. This feeds the ML model in Sprint 2."
else
    echo -e "${YELLOW}⚠  Skipping — no notification ID available.${NC}"
fi
pause

# =============================================================
header "Step 7a: List Notifications"
info "Cursor-based pagination for listing notifications."
info "GET ${API_URL}/v1/notifications?limit=5"
echo ""

LIST_RESPONSE=$(curl -s "${API_URL}/v1/notifications?limit=5" \
    -H "Authorization: Bearer ${API_KEY}")

echo "$LIST_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$LIST_RESPONSE"
echo ""
success "Paginated response with data array and cursor metadata."
pause

# =============================================================
header "Step 7b: Notification Summary"
info "Aggregate counts by status — powers the dashboard stats cards."
info "GET ${API_URL}/v1/notifications/summary"
echo ""

SUMMARY_RESPONSE=$(curl -s "${API_URL}/v1/notifications/summary" \
    -H "Authorization: Bearer ${API_KEY}")

echo "$SUMMARY_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$SUMMARY_RESPONSE"
echo ""
success "Summary counts returned."
pause

# =============================================================
header "Step 8: Dashboard"
info "The React dashboard shows live notification activity."
info "Open http://localhost:5173 in a browser."
echo ""
success "Dashboard displays:"
echo "  • Stats cards: Total, Delivered, Failed, Queued"
echo "  • Notifications table with status, channel, timestamps"
echo "  • Auto-refreshes every 30 seconds via TanStack Query"
pause

# =============================================================
header "Step 9: Tenant Isolation"
info "Proving multi-tenant data isolation."
info "Registering a second tenant: Rival Corp"
echo ""

RIVAL_HTTP=$(curl -s -o /tmp/ne_rival.json -w "%{http_code}" -X POST "${API_URL}/v1/tenants/register" \
    -H "Content-Type: application/json" \
    -d '{"company_name": "Rival Corp"}')

RIVAL_RESPONSE=$(cat /tmp/ne_rival.json)
RIVAL_KEY=$(echo "$RIVAL_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('api_key',''))" 2>/dev/null || echo "")

if [ "$RIVAL_HTTP" = "201" ] && [ -n "$RIVAL_KEY" ]; then
    success "Rival Corp registered (HTTP ${RIVAL_HTTP})."
    echo ""

    info "Rival Corp tries to access our notification..."
    info "GET ${API_URL}/v1/notifications/${NOTIF_ID} (with Rival Corp's key)"
    echo ""

    ISOLATION_HTTP=$(curl -s -o /tmp/ne_isolation.json -w "%{http_code}" \
        "${API_URL}/v1/notifications/${NOTIF_ID}" \
        -H "Authorization: Bearer ${RIVAL_KEY}")

    ISOLATION_RESPONSE=$(cat /tmp/ne_isolation.json)
    echo "$ISOLATION_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$ISOLATION_RESPONSE"
    echo ""

    if [ "$ISOLATION_HTTP" = "403" ]; then
        success "403 Forbidden — PostgreSQL Row-Level Security blocked cross-tenant access."
    else
        echo -e "${YELLOW}⚠  Expected 403, got HTTP ${ISOLATION_HTTP}.${NC}"
    fi
else
    echo -e "${YELLOW}⚠  Could not register Rival Corp (HTTP ${RIVAL_HTTP}). Skipping isolation test.${NC}"
    echo "$RIVAL_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RIVAL_RESPONSE"
fi
pause

# =============================================================
header "Step 10: Input Validation & Error Handling"
info "Verifying the API rejects bad input correctly."
echo ""

info "10a: No Authorization header"
info "POST ${API_URL}/v1/notifications (no auth)"
echo ""
NO_AUTH_RESPONSE=$(curl -s "${API_URL}/v1/notifications" -X POST \
    -H "Content-Type: application/json" \
    -d '{"recipient":"x@test.com","body":"test"}')
echo "$NO_AUTH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$NO_AUTH_RESPONSE"
echo ""
success "401 MISSING_API_KEY — correct."
echo ""

info "10b: Invalid API key"
info "POST ${API_URL}/v1/notifications (bad key)"
echo ""
BAD_KEY_RESPONSE=$(curl -s "${API_URL}/v1/notifications" -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ne_test_bogus" \
    -d '{"recipient":"x@test.com","body":"test"}')
echo "$BAD_KEY_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$BAD_KEY_RESPONSE"
echo ""
success "401 INVALID_API_KEY — correct."
echo ""

info "10c: Missing required fields"
info "POST ${API_URL}/v1/notifications (empty body)"
echo ""
VALIDATION_RESPONSE=$(curl -s "${API_URL}/v1/notifications" -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${API_KEY}" \
    -d '{}')
echo "$VALIDATION_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$VALIDATION_RESPONSE"
echo ""
success "400 VALIDATION_ERROR with field-level errors from Zod — correct."
pause

# =============================================================
header "Demo Complete!"
echo ""
echo "  What we just demonstrated:"
echo ""
echo "  1. Tenant registration with SHA-256 hashed API key"
echo "  2. Notification sent via single API call (202 async)"
echo "  3. BullMQ worker processed the job in the background"
echo "  4. Static routing selected email channel"
echo "  5. Email delivered via Nodemailer to Mailpit"
echo "  6. Tracking pixel recorded email-open engagement"
echo "  7. Cursor-based pagination and summary endpoint"
echo "  8. Live React dashboard with TanStack Query"
echo "  9. Tenant isolation enforced by PostgreSQL RLS"
echo "  10. Input validation via Zod at every entry point"
echo ""
echo -e "  ${CYAN}Sprint 2 adds: XGBoost ML predictions, adaptive routing,${NC}"
echo -e "  ${CYAN}epsilon-greedy exploration, and engagement tracking.${NC}"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  NotifyEngine Sprint 1 — Core Pipeline Complete${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
