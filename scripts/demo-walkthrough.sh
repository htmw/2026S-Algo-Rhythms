#!/usr/bin/env bash
cat << 'EOF'

               __  .__  _____                            .__               
  ____   _____/  |_|__|/ ____\__.__. ____   ____    ____ |__| ____   ____  
 /    \ /  _ \   __\  \   __<   |  |/ __ \ /    \  / ___\|  |/    \_/ __ \ 
|   |  (  <_> )  | |  ||  |  \___  \  ___/|   |  \/ /_/  >  |   |  \  ___/ 
|___|  /\____/|__| |__||__|  / ____|\___  >___|  /\___  /|__|___|  /\___  >
     \/                      \/         \/     \//_____/         \/     \/ 

                    Sprint 3 Demo Walkthrough

EOF
echo ""
echo -e "\033[0;35m\033[1m  >>> Press ENTER to begin <<<\033[0m"
read -r

set -euo pipefail

# Cross-platform browser open
if command -v open &>/dev/null; then
  BROWSER_OPEN="open"
elif command -v start &>/dev/null; then
  BROWSER_OPEN="start"
elif command -v xdg-open &>/dev/null; then
  BROWSER_OPEN="xdg-open"
else
  BROWSER_OPEN="echo 'Open in browser:'"
fi

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
else
  echo "FATAL: .env not found at $REPO_ROOT/.env"
  exit 1
fi

DB_USER="${POSTGRES_USER:-notify}"
DB_NAME="${POSTGRES_DB:-notifyengine}"
API_PORT="${PORT:-3000}"
DASHBOARD_PORT=5173
MAILPIT_UI_PORT=8025
ML_SERVICE_PORT=8000

API_PID=""
WORKER_PID=""
DASH_PID=""

DEMO_KEY=""
DEMO_TENANT_ID=""
DEMO_NOTIF_ID=""
RIVAL_KEY=""
RIVAL_TENANT_ID=""
REGISTER_RESPONSE=""
RUN_TAG="$(date +%s)"

DEMO_DIR="$REPO_ROOT/.demo"
DASH_ENV="$REPO_ROOT/apps/dashboard/.env"
DASH_ENV_BAK="$REPO_ROOT/apps/dashboard/.env.bak"

# ---------------------------------------------------------------------------
# COLORS & FORMATTING
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------
banner() {
  echo ""
  echo -e "${BLUE}${BOLD}============================================================================${RESET}"
  echo -e "${BLUE}${BOLD}  $1${RESET}"
  echo -e "${BLUE}${BOLD}============================================================================${RESET}"
  echo ""
}

step() {
  echo ""
  echo -e "${CYAN}${BOLD}--- STEP $1: $2 ---${RESET}"
  echo ""
}

show() {
  echo -e "${GREEN}  SHOW:${RESET} $1"
}

info() {
  echo -e "${DIM}  $1${RESET}"
}

success() {
  echo -e "${GREEN}${BOLD}  [OK]${RESET} $1"
}

fail() {
  echo -e "${RED}${BOLD}  [FAIL]${RESET} $1"
}

warn() {
  echo -e "${YELLOW}  [WARN]${RESET} $1"
}

divider() {
  echo -e "${DIM}  --------------------------------------------------------------------------${RESET}"
}

press_enter() {
  echo ""
  echo -e "${MAGENTA}${BOLD}  >>> Press ENTER to continue <<<${RESET}"
  read -r
}

focus_terminal() {
  osascript -e 'tell application "Terminal" to activate' 2>/dev/null || true
}

instruction_box() {
  local input="$1"
  local max_len=0
  while IFS= read -r line; do
    (( ${#line} > max_len )) && max_len=${#line}
  done <<< "$input"
  max_len=$((max_len + 2))
  printf "\n${CYAN}${BOLD}"
  printf "  ┌"; printf '─%.0s' $(seq 1 $max_len); printf "┐\n"
  while IFS= read -r line; do
    printf "  │ %-*s│\n" $((max_len - 1)) "$line"
  done <<< "$input"
  printf "  └"; printf '─%.0s' $(seq 1 $max_len); printf "┘"
  printf "${RESET}\n\n"
}

run_sql() {
  docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" --pset=pager=off -c "$1" 2>/dev/null
}

run_sql_quiet() {
  docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -t -A -c "$1" 2>/dev/null
}

parse_json() {
  node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d['$2'] || '')"  <<< "$1"
}

pretty_json() {
  python3 -m json.tool 2>/dev/null || cat
}

wait_for_port() {
  local port=$1
  local name=$2
  local max_wait=${3:-30}
  local waited=0
  while ! curl -s "http://localhost:$port" > /dev/null 2>&1; do
    sleep 1
    waited=$((waited + 1))
    if [[ $waited -ge $max_wait ]]; then
      fail "$name did not start on port $port within ${max_wait}s"
      return 1
    fi
  done
  success "$name is up on port $port (${waited}s)"
}

# ---------------------------------------------------------------------------
# CLEANUP (runs on exit)
# ---------------------------------------------------------------------------
cleanup() {
  echo ""
  echo -e "${YELLOW}Cleaning up background processes...${RESET}"
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null && echo "  Killed API (PID $API_PID)"
  [[ -n "$WORKER_PID" ]] && kill "$WORKER_PID" 2>/dev/null && echo "  Killed Worker (PID $WORKER_PID)"
  [[ -n "$DASH_PID" ]] && kill "$DASH_PID" 2>/dev/null && echo "  Killed Dashboard (PID $DASH_PID)"
  pkill -f "workspace=@notifyengine/api" 2>/dev/null || true
  pkill -f "workspace=@notifyengine/worker" 2>/dev/null || true
  pkill -f "vite.*5173" 2>/dev/null || true
  if [[ -f "$DASH_ENV_BAK" ]]; then
    mv "$DASH_ENV_BAK" "$DASH_ENV"
    echo "  Restored apps/dashboard/.env from backup"
  fi
  echo -e "${GREEN}Cleanup complete.${RESET}"
}
trap cleanup EXIT


# ============================================================================
# ACT 0: TEARDOWN & CLEAN START
# ============================================================================
banner "ACT 0: TEARDOWN & CLEAN START"

step "0.1" "Kill any running NotifyEngine processes"

echo "  Killing API server..."
pkill -f "workspace=@notifyengine/api" 2>/dev/null && success "API killed" || info "No API process found"

echo "  Killing Worker..."
pkill -f "workspace=@notifyengine/worker" 2>/dev/null && success "Worker killed" || info "No Worker process found"

echo "  Killing Dashboard..."
pkill -f "vite.*5173" 2>/dev/null && success "Dashboard killed" || info "No Dashboard process found"

sleep 2

press_enter

step "0.2" "Restart Docker infrastructure"
show "Docker containers coming up: postgres, redis, ml-service, mailpit"

docker compose down 2>/dev/null || true
sleep 2
docker compose up -d

echo ""
echo "  Waiting for containers to be healthy..."
sleep 5

docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker compose ps

press_enter

step "0.3" "Run database migrations"
show "Migration output"

npx tsx infra/migrate.ts

press_enter

step "0.4" "Start API server"
show "API server log output"

npm run dev --workspace=@notifyengine/api > /tmp/ne-api.log 2>&1 &
API_PID=$!
info "API PID: $API_PID (log: /tmp/ne-api.log)"

echo "  Waiting for API on port $API_PORT..."
wait_for_port "$API_PORT" "API Server" 15

echo ""
head -5 /tmp/ne-api.log 2>/dev/null || true

press_enter

step "0.5" "Start Worker"
show "Worker log output (4 priority queues)"

npm run dev --workspace=@notifyengine/worker > /tmp/ne-worker.log 2>&1 &
WORKER_PID=$!
info "Worker PID: $WORKER_PID (log: /tmp/ne-worker.log)"

sleep 3
grep -i "ready\|started\|listening" /tmp/ne-worker.log 2>/dev/null | head -6 || tail -5 /tmp/ne-worker.log 2>/dev/null || true

press_enter

step "0.6" "Register demo tenant"
show "POST /v1/tenants/register"

REGISTER_RESPONSE=$(curl -s -X POST "http://localhost:$API_PORT/v1/tenants/register" \
  -H "Content-Type: application/json" \
  -d "{\"company_name\": \"Acme Notifications $RUN_TAG\"}")

echo "$REGISTER_RESPONSE" | pretty_json

DEMO_KEY=$(parse_json "$REGISTER_RESPONSE" "api_key")
DEMO_TENANT_ID=$(parse_json "$REGISTER_RESPONSE" "tenant_id")

if [[ -z "$DEMO_KEY" ]]; then
  fail "Could not capture API key from registration response"
  exit 1
fi

success "Captured API key: ${DEMO_KEY:0:20}..."
success "Captured tenant ID: $DEMO_TENANT_ID"

press_enter

step "0.7" "Write demo state and configure dashboard"

mkdir -p "$DEMO_DIR"
cat > "$DEMO_DIR/state.env" <<STATEEOF
DEMO_TENANT_ID=$DEMO_TENANT_ID
DEMO_TENANT_NAME=Acme Notifications $RUN_TAG
DEMO_API_KEY=$DEMO_KEY
STATEEOF

success "Wrote $DEMO_DIR/state.env"

cp "$DASH_ENV" "$DASH_ENV_BAK"
success "Backed up apps/dashboard/.env to .env.bak"

cat > "$DASH_ENV" <<DASHEOF
VITE_API_URL=http://localhost:$API_PORT
VITE_API_KEY=$DEMO_KEY
DASHEOF

success "Updated apps/dashboard/.env with demo tenant key"
info "Dashboard will boot with key: ${DEMO_KEY:0:20}..."

press_enter

step "0.8" "Start Dashboard (with demo tenant key)"
show "Dashboard dev server"

npm run dev --workspace=@notifyengine/dashboard > /tmp/ne-dashboard.log 2>&1 &
DASH_PID=$!
info "Dashboard PID: $DASH_PID (log: /tmp/ne-dashboard.log)"

sleep 4
success "Dashboard starting on port $DASHBOARD_PORT"

press_enter

step "0.9" "Health check - all services"

echo "  API Server:"
curl -s "http://localhost:$API_PORT/health" | pretty_json
echo ""

echo "  ML Service:"
curl -s "http://localhost:$ML_SERVICE_PORT/health" | pretty_json 2>/dev/null || warn "ML service health check not available"
echo ""

echo "  Mailpit:"
curl -s "http://localhost:$MAILPIT_UI_PORT/api/v1/info" | pretty_json 2>/dev/null || success "Mailpit UI responding"
echo ""

echo "  Redis:"
docker compose exec -T redis redis-cli ping
echo ""

banner "INFRASTRUCTURE READY"

press_enter


# ============================================================================
# ACT 1: TENANT REGISTRATION (DB PROOF)
# ============================================================================
banner "ACT 1: TENANT REGISTRATION"

step "1.1" "Registration response (from ACT 0)"
show "What a developer gets when they sign up"

echo "$REGISTER_RESPONSE" | pretty_json

press_enter

step "1.2" "Show what registration created in the database"
show "Tenants table"

run_sql "SELECT id, name, slug, plan, adaptive_routing_enabled, exploration_rate, created_at
         FROM tenants WHERE id = '$DEMO_TENANT_ID';"

divider
show "API keys table (key_hash, not raw key - SHA-256)"

run_sql "SELECT id, tenant_id, key_prefix, LEFT(key_hash, 20) || '...' AS key_hash_preview,
                scopes, created_at
         FROM api_keys WHERE tenant_id = '$DEMO_TENANT_ID';"

divider
show "Default channels created automatically"

run_sql "SELECT type, label, priority, is_enabled, circuit_state
         FROM channels WHERE tenant_id = '$DEMO_TENANT_ID'
         ORDER BY priority DESC;"

press_enter


# ============================================================================
# ACT 2: LIVE EMAIL DELIVERY
# ============================================================================
banner "ACT 2: LIVE EMAIL DELIVERY"

step "2.1" "Open Mailpit to watch email arrive live"
show "Opening Mailpit inbox in browser"

$BROWSER_OPEN "http://localhost:$MAILPIT_UI_PORT"
sleep 3

info "Mailpit is open. The inbox is empty."
info "Press ENTER to send a security alert — watch it arrive live."

press_enter

step "2.2" "Send a notification - security alert (critical priority)"
focus_terminal
show "POST /v1/notifications"

RESPONSE_TIME=$(curl -s -o /tmp/ne-notif-response.json -w "%{time_total}" \
  -X POST "http://localhost:$API_PORT/v1/notifications" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DEMO_KEY" \
  -d '{
    "recipient": "demo@example.com",
    "subject": "SECURITY ALERT: Unusual login detected",
    "body": "We detected a login from a new device in Moscow, Russia at 3:47 AM. If this was not you, reset your password immediately.",
    "body_html": "<h1>Security Alert</h1><p>We detected a login from a new device in <strong>Moscow, Russia</strong> at 3:47 AM.</p><p>If this was not you, <a href=\"#\">reset your password immediately</a>.</p>",
    "priority": "critical",
    "routing_mode": "adaptive"
  }')

NOTIF_JSON=$(cat /tmp/ne-notif-response.json)

echo "$NOTIF_JSON" | pretty_json
echo ""
echo -e "  ${GREEN}Response time: ${RESPONSE_TIME}s${RESET}"

DEMO_NOTIF_ID=$(parse_json "$NOTIF_JSON" "id")
success "Captured notification ID: $DEMO_NOTIF_ID"

echo ""
info "Check Mailpit — the email should appear within seconds."
echo "  Waiting 5 seconds for worker to process and deliver..."
sleep 5

press_enter


# ============================================================================
# ACT 3: AI CONTENT CLASSIFICATION
# ============================================================================
banner "ACT 3: AI CONTENT CLASSIFICATION"

step "3.1" "Content classification from the ML service"
focus_terminal
show "content_classification JSONB on the notification record"

run_sql "SELECT
           id,
           status,
           delivered_via,
           priority,
           content_classification->>'urgency_score' AS urgency,
           content_classification->>'category' AS category,
           content_classification->>'sentiment_score' AS sentiment,
           content_classification->>'time_sensitivity_score' AS time_sensitivity,
           content_classification->>'optimal_channel_hint' AS channel_hint,
           content_classification->>'reasoning' AS reasoning
         FROM notifications
         WHERE id = '$DEMO_NOTIF_ID';"

press_enter

step "3.2" "Routing decision (XGBoost + content classification)"
show "routing_decision JSONB"

run_sql "SELECT
           routing_decision->>'reason' AS routing_reason,
           routing_decision->>'model_version' AS model_version,
           routing_decision->>'exploration' AS was_exploration,
           routing_decision->'predictions' AS channel_predictions
         FROM notifications
         WHERE id = '$DEMO_NOTIF_ID';"

press_enter

step "3.3" "Delivery attempt with feature vector"
show "delivery_attempts table - the full audit trail"

run_sql "SELECT
           da.id,
           da.channel_type,
           da.attempt_number,
           da.status,
           da.duration_ms,
           da.engaged,
           da.started_at,
           da.completed_at,
           LEFT(da.feature_vector::text, 80) || '...' AS feature_vector_preview
         FROM delivery_attempts da
         WHERE da.notification_id = '$DEMO_NOTIF_ID';"

press_enter

step "3.4" "Full delivery record via API"
show "GET /v1/notifications/:id"

curl -s "http://localhost:$API_PORT/v1/notifications/$DEMO_NOTIF_ID" \
  -H "Authorization: Bearer $DEMO_KEY" | pretty_json

press_enter


# ============================================================================
# ACT 4: ENGAGEMENT TRACKING
# ============================================================================
banner "ACT 4: ENGAGEMENT TRACKING"

step "4.1" "Simulate user opening the email (tracking pixel)"

TRACK_STATUS=$(curl -s -w "%{http_code}" -o /dev/null \
  "http://localhost:$API_PORT/v1/engagement/track?nid=$DEMO_NOTIF_ID")

if [[ "$TRACK_STATUS" == "200" ]]; then
  success "Tracking pixel returned HTTP 200 (image/gif)"
else
  warn "Tracking pixel returned HTTP $TRACK_STATUS"
fi

press_enter

step "4.2" "Verify engagement was recorded"
show "delivery_attempts - engaged column should now be true"

run_sql "SELECT
           da.channel_type,
           da.engaged,
           da.engagement_type,
           da.engaged_at,
           da.status
         FROM delivery_attempts da
         WHERE da.notification_id = '$DEMO_NOTIF_ID';"

press_enter

step "4.3" "Recipient channel stats (rolling aggregates)"
show "recipient_channel_stats - per-recipient, per-channel performance"

run_sql "SELECT
           recipient,
           channel_type,
           attempts_30d,
           successes_30d,
           engagements_30d,
           CASE WHEN attempts_30d > 0
                THEN ROUND(engagements_30d::numeric / attempts_30d * 100, 1)
                ELSE 0
           END AS engagement_rate_pct,
           last_engaged_at
         FROM recipient_channel_stats
         WHERE tenant_id = '$DEMO_TENANT_ID'
         ORDER BY recipient, channel_type;"

press_enter


# ============================================================================
# ACT 5: LIVE DASHBOARD DEMO
# ============================================================================
banner "ACT 5: LIVE DASHBOARD DEMO"

# --- 5a: Dashboard Home ---
step "5a" "Dashboard Home - main stats and notification table"
show "Opening dashboard home page"
info "The dashboard is configured with this demo tenant's API key."
info "It shows real-time data via Socket.IO and TanStack Query."

$BROWSER_OPEN "http://localhost:$DASHBOARD_PORT/dashboard"
sleep 3

info "Dashboard showing current state. Press ENTER to begin notification burst."

press_enter

# --- 5b: Notification burst ---
step "5b" "Notification burst - staggered sends with live updates"

instruction_box "Option A: Press ENTER to auto-send 6
notifications via the terminal.

Option B: Type 'manual' then ENTER to send
them from the dashboard Compose form instead."

echo -ne "  ${MAGENTA}${BOLD}  Choice [ENTER/manual]: ${RESET}"
read -r BURST_CHOICE

DEMO_SUBJECTS=(
  "Your order has shipped - tracking inside"
  "Flash sale: 50% off everything for 2 hours"
  "Your appointment is tomorrow at 2:00 PM"
  "Weekly digest: 5 new articles you might like"
  "Password reset requested for your account"
  "Your subscription renews in 3 days"
)

DEMO_BODIES=(
  "Order #8291 shipped via FedEx. Expected delivery: Thursday."
  "Don't miss out! Use code FLASH50 at checkout. Ends at midnight."
  "Dr. Smith at 123 Main St. Reply CONFIRM to keep your slot."
  "Top stories this week: AI breakthroughs, market trends, and more."
  "Click the link to reset your password. This link expires in 1 hour."
  "Your Pro plan renews on May 17 for \$29/month. Manage billing in settings."
)

DEMO_RECIPIENTS=(
  "user_email_lover@sim.notifyengine.dev"
  "user_push_fan@sim.notifyengine.dev"
  "user_sms_responder@sim.notifyengine.dev"
  "user_balanced@sim.notifyengine.dev"
  "user_email_lover_02@sim.notifyengine.dev"
  "user_disengaged@sim.notifyengine.dev"
)

DEMO_PRIORITIES=("high" "standard" "high" "bulk" "critical" "standard")

if [[ "$BURST_CHOICE" == "manual" ]]; then
  info "Manual mode: paste each notification into the dashboard Compose form."
  for i in "${!DEMO_SUBJECTS[@]}"; do
    instruction_box "NOTIFICATION $(($i+1))/6 — PASTE INTO COMPOSE FORM:

Recipient: ${DEMO_RECIPIENTS[$i]}
Subject:   ${DEMO_SUBJECTS[$i]}
Body:      ${DEMO_BODIES[$i]}
Priority:  ${DEMO_PRIORITIES[$i]}

Click SEND on the page."
    press_enter
  done
  success "All 6 notifications sent manually via dashboard."
  info "Watch the dashboard stats update..."
  sleep 5
else
  info "Watch notifications appear on the dashboard one by one."
  for i in "${!DEMO_SUBJECTS[@]}"; do
    echo -e "  ${CYAN}Sending [$(($i+1))/6]:${RESET} ${DEMO_SUBJECTS[$i]:0:55}..."
    curl -s -X POST "http://localhost:$API_PORT/v1/notifications" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $DEMO_KEY" \
      -d "{
        \"recipient\": \"${DEMO_RECIPIENTS[$i]}\",
        \"subject\": \"${DEMO_SUBJECTS[$i]}\",
        \"body\": \"${DEMO_BODIES[$i]}\",
        \"priority\": \"${DEMO_PRIORITIES[$i]}\",
        \"routing_mode\": \"adaptive\"
      }" > /dev/null
    sleep 2
  done
  success "6 notifications sent with 2-second stagger"
  info "Watch the dashboard stats update..."
  sleep 5
fi

press_enter

focus_terminal
show "Notifications processed for this tenant"

run_sql "SELECT
           status,
           COUNT(*) AS count,
           COUNT(DISTINCT recipient) AS unique_recipients
         FROM notifications
         WHERE tenant_id = '$DEMO_TENANT_ID'
         GROUP BY status
         ORDER BY status;"

divider
show "Delivery attempts by channel"

run_sql "SELECT
           channel_type,
           COUNT(*) AS attempts,
           COUNT(*) FILTER (WHERE status = 'success') AS successes,
           ROUND(AVG(duration_ms)::numeric, 1) AS avg_duration_ms
         FROM delivery_attempts
         WHERE tenant_id = '$DEMO_TENANT_ID'
         GROUP BY channel_type
         ORDER BY channel_type;"

press_enter

# --- 5c: Simulation Control Panel (interactive) ---
step "5c.1" "Simulation Control Panel"
show "Opening simulation page"

$BROWSER_OPEN "http://localhost:$DASHBOARD_PORT/simulation"
sleep 3

info "Simulation Control Panel loaded."

press_enter

# --- 5c.2: Compose Form Demo ---
step "5c.2" "Compose Form Demo"
focus_terminal

COMPOSE_BEFORE_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

instruction_box "PASTE INTO COMPOSE FORM:

Recipient: demo@example.com
Subject:   SECURITY ALERT: Unauthorized access
Body:      We detected a login from an unrecognized
           device in Moscow, Russia at 3:47 AM.
           If this was not you, reset your password
           immediately.

Then click SEND on the page."

info "Fill the form, click Send, watch the classification card appear."

press_enter

focus_terminal
info "Waiting 5 seconds for worker to process..."
sleep 5

show "Most recent notification: content_classification and routing_decision"

run_sql "SELECT
           LEFT(subject, 45) AS subject,
           content_classification->>'category' AS category,
           content_classification->>'urgency_score' AS urgency,
           content_classification->>'optimal_channel_hint' AS hint,
           routing_decision->>'selected' AS routed_to,
           routing_decision->>'reason' AS reason
         FROM notifications
         WHERE tenant_id = '$DEMO_TENANT_ID'
           AND created_at > '$COMPOSE_BEFORE_TS'
         ORDER BY created_at DESC
         LIMIT 1;"

press_enter

# --- 5c.3: Scenario Launcher Demo ---
step "5c.3" "Scenario Launcher Demo"
focus_terminal

SCENARIO_BEFORE_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

instruction_box "On the Simulation Control Panel page,
click the \"Security Alert Blast\" scenario card.

Watch 5 notifications fire through the system."

info "Click the scenario card, then press ENTER."

press_enter

info "Waiting 30 seconds for notifications to classify (each calls Claude Sonnet)..."
sleep 30

CLASSIFIED_COUNT=$(run_sql_quiet "SELECT COUNT(*) FROM notifications WHERE tenant_id = '$DEMO_TENANT_ID' AND created_at > '$SCENARIO_BEFORE_TS' AND content_classification IS NOT NULL;")
CLASSIFIED_COUNT=$(echo "$CLASSIFIED_COUNT" | tr -d ' ')
TOTAL_COUNT=$(run_sql_quiet "SELECT COUNT(*) FROM notifications WHERE tenant_id = '$DEMO_TENANT_ID' AND created_at > '$SCENARIO_BEFORE_TS';")
TOTAL_COUNT=$(echo "$TOTAL_COUNT" | tr -d ' ')

if [ "$CLASSIFIED_COUNT" -lt "$TOTAL_COUNT" ] 2>/dev/null; then
  info "Classified $CLASSIFIED_COUNT/$TOTAL_COUNT so far — waiting 15 more seconds..."
  sleep 15
fi

focus_terminal
show "Content classification and routing for scenario notifications"

run_sql "SELECT
           LEFT(subject, 45) AS subject,
           content_classification->>'category' AS category,
           content_classification->>'optimal_channel_hint' AS hint,
           routing_decision->>'selected' AS routed_to,
           routing_decision->>'exploration' AS explored
         FROM notifications
         WHERE tenant_id = '$DEMO_TENANT_ID'
           AND created_at > '$SCENARIO_BEFORE_TS'
         ORDER BY created_at DESC;"

press_enter

# --- 5d: Data Transparency Page ---
step "5d" "Data Transparency Page"
show "Opening transparency page"

$BROWSER_OPEN "http://localhost:$DASHBOARD_PORT/transparency"
sleep 3

info "Data Transparency page loaded. Showing audit data and model metrics."

press_enter

focus_terminal
show "Per-recipient engagement rates"

run_sql "SELECT
           LEFT(recipient, 35) AS recipient,
           channel_type,
           attempts_30d,
           successes_30d,
           engagements_30d,
           CASE WHEN attempts_30d > 0
                THEN ROUND(engagements_30d::numeric / attempts_30d * 100, 1)
                ELSE 0
           END AS engagement_rate_pct
         FROM recipient_channel_stats
         WHERE tenant_id = '$DEMO_TENANT_ID'
         ORDER BY recipient, channel_type;"

divider
show "Model metadata (version, AUC-ROC, training samples)"

run_sql "SELECT
           version,
           training_samples,
           auc_roc,
           accuracy,
           is_active,
           training_date
         FROM model_metadata
         WHERE tenant_id = '$DEMO_TENANT_ID'
            OR tenant_id IS NULL
         ORDER BY training_date DESC
         LIMIT 3;"

divider
show "Training data and engagement rate"

run_sql "SELECT
           COUNT(*) AS total_delivery_attempts,
           COUNT(*) FILTER (WHERE engaged = true) AS engaged,
           COUNT(*) FILTER (WHERE engaged = false OR engaged IS NULL) AS not_engaged,
           CASE WHEN COUNT(*) > 0
                THEN ROUND(COUNT(*) FILTER (WHERE engaged = true)::numeric / COUNT(*) * 100, 1)
                ELSE 0
           END AS engagement_rate_pct
         FROM delivery_attempts
         WHERE tenant_id = '$DEMO_TENANT_ID';"

press_enter

# --- 5e: Routing Intelligence ---
step "5e" "Routing Intelligence"
show "Opening routing page"

$BROWSER_OPEN "http://localhost:$DASHBOARD_PORT/routing"
sleep 3

info "Routing Intelligence page loaded."
info "Shows per-recipient routing predictions and channel performance."

press_enter


# ============================================================================
# ACT 6: ML LEARNING LOOP
# ============================================================================
banner "ACT 6: ML LEARNING LOOP"

step "6.1" "Current model state (BEFORE retrain)"
focus_terminal
show "model_metadata table - the ML model's report card"

run_sql "SELECT
           version,
           training_samples,
           auc_roc,
           accuracy,
           precision_score,
           recall_score,
           f1_score,
           is_active,
           promoted_at,
           training_date
         FROM model_metadata
         WHERE tenant_id = '$DEMO_TENANT_ID'
            OR tenant_id IS NULL
         ORDER BY training_date DESC
         LIMIT 3;"

divider
show "Feature vector from a recent delivery (the 19 features XGBoost sees)"

run_sql "SELECT feature_vector
         FROM delivery_attempts
         WHERE tenant_id = '$DEMO_TENANT_ID'
           AND feature_vector IS NOT NULL
         ORDER BY completed_at DESC
         LIMIT 1;"

press_enter

step "6.2" "Trigger model retrain"
focus_terminal

RETRAIN_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "http://localhost:$API_PORT/v1/simulation/retrain" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DEMO_KEY" 2>/dev/null || echo "000")

if [[ "$RETRAIN_CHECK" == "404" || "$RETRAIN_CHECK" == "000" ]]; then
  info "Retrain proxy endpoint not available. Calling ML service directly."
  RETRAIN_RESPONSE=$(curl -s -X POST "http://localhost:$ML_SERVICE_PORT/train" \
    -H "Content-Type: application/json" \
    -d "{\"tenant_id\": \"$DEMO_TENANT_ID\"}" 2>/dev/null || echo '{"error": "ML service not responding"}')
else
  RETRAIN_RESPONSE=$(curl -s -X POST "http://localhost:$API_PORT/v1/simulation/retrain" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $DEMO_KEY")
fi

echo "$RETRAIN_RESPONSE" | pretty_json

press_enter

step "6.3" "Model metadata AFTER retrain"

run_sql "SELECT
           version,
           training_samples,
           auc_roc,
           accuracy,
           is_active,
           promoted_at,
           training_date
         FROM model_metadata
         WHERE tenant_id = '$DEMO_TENANT_ID'
            OR tenant_id IS NULL
         ORDER BY training_date DESC
         LIMIT 3;"

press_enter

step "6.4" "Re-open Data Transparency page (updated model metrics)"
show "Opening transparency page after retrain"

$BROWSER_OPEN "http://localhost:$DASHBOARD_PORT/transparency"
sleep 3

info "Transparency page refreshed — audience can see updated model version/metrics."

press_enter


# ============================================================================
# ACT 7: CONTENT-AWARE ROUTING COMPARISON
# ============================================================================
banner "ACT 7: CONTENT-AWARE ROUTING COMPARISON"

step "7.1" "Send a marketing notification (different content type)"
focus_terminal

MARKETING_RESPONSE=$(curl -s -X POST "http://localhost:$API_PORT/v1/notifications" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DEMO_KEY" \
  -d '{
    "recipient": "demo@example.com",
    "subject": "Weekend Sale: 40% off all items!",
    "body": "Shop our biggest sale of the season. Use code WEEKEND40 at checkout. Free shipping on orders over $50.",
    "priority": "standard",
    "routing_mode": "adaptive"
  }')

MARKETING_ID=$(parse_json "$MARKETING_RESPONSE" "id")
echo "$MARKETING_RESPONSE" | pretty_json

echo "  Waiting 5 seconds for classification..."
sleep 5

press_enter

step "7.2" "Side-by-side: Security Alert vs Marketing"
show "Content classification comparison"

run_sql "SELECT
           LEFT(subject, 40) AS subject,
           content_classification->>'urgency_score' AS urgency,
           content_classification->>'category' AS category,
           content_classification->>'sentiment_score' AS sentiment,
           content_classification->>'time_sensitivity_score' AS time_sens,
           content_classification->>'optimal_channel_hint' AS hint
         FROM notifications
         WHERE id IN ('$DEMO_NOTIF_ID', '$MARKETING_ID')
         ORDER BY created_at;"

press_enter


# ============================================================================
# ACT 8: TENANT ISOLATION & SECURITY
# ============================================================================
banner "ACT 8: TENANT ISOLATION & SECURITY"

step "8.1" "Register a second tenant"

RIVAL_RESPONSE=$(curl -s -X POST "http://localhost:$API_PORT/v1/tenants/register" \
  -H "Content-Type: application/json" \
  -d "{\"company_name\": \"Rival Corp $RUN_TAG\"}")

RIVAL_KEY=$(parse_json "$RIVAL_RESPONSE" "api_key")
RIVAL_TENANT_ID=$(parse_json "$RIVAL_RESPONSE" "tenant_id")
echo "$RIVAL_RESPONSE" | pretty_json

press_enter

step "8.2" "Rival Corp tries to access Acme's notification"
show "Cross-tenant access attempt - should get 403/404"

curl -s "http://localhost:$API_PORT/v1/notifications/$DEMO_NOTIF_ID" \
  -H "Authorization: Bearer $RIVAL_KEY" | pretty_json

press_enter

step "8.3" "API-level tenant isolation proof"
show "Rival Corp lists their own notifications (should be empty)"

curl -s "http://localhost:$API_PORT/v1/notifications" \
  -H "Authorization: Bearer $RIVAL_KEY" | pretty_json

divider
show "Acme lists their notifications (should show all demo data)"

curl -s "http://localhost:$API_PORT/v1/notifications" \
  -H "Authorization: Bearer $DEMO_KEY" | pretty_json

press_enter


# ============================================================================
# ACT 9: FULL SYSTEM STATE
# ============================================================================
banner "ACT 9: FULL SYSTEM STATE"

step "9.1" "Notifications summary"

run_sql "SELECT
           status,
           COUNT(*) AS count,
           COUNT(DISTINCT recipient) AS unique_recipients
         FROM notifications
         WHERE tenant_id = '$DEMO_TENANT_ID'
         GROUP BY status
         ORDER BY status;"

step "9.2" "Delivery attempts summary"

run_sql "SELECT
           channel_type,
           COUNT(*) AS attempts,
           COUNT(*) FILTER (WHERE status = 'success') AS successes,
           COUNT(*) FILTER (WHERE engaged = true) AS engagements,
           ROUND(AVG(duration_ms)::numeric, 1) AS avg_duration_ms
         FROM delivery_attempts
         WHERE tenant_id = '$DEMO_TENANT_ID'
         GROUP BY channel_type
         ORDER BY channel_type;"

step "9.3" "Recipient channel stats (ML training signals)"

run_sql "SELECT
           LEFT(recipient, 35) AS recipient,
           channel_type,
           attempts_30d,
           successes_30d,
           engagements_30d,
           CASE WHEN attempts_30d > 0
                THEN ROUND(engagements_30d::numeric / attempts_30d * 100, 1)
                ELSE 0
           END AS rate_pct
         FROM recipient_channel_stats
         WHERE tenant_id = '$DEMO_TENANT_ID'
         ORDER BY recipient, channel_type;"

step "9.4" "Channel circuit breaker states"

run_sql "SELECT
           type,
           label,
           circuit_state,
           failure_count,
           is_enabled,
           priority
         FROM channels
         WHERE tenant_id = '$DEMO_TENANT_ID'
         ORDER BY priority DESC;"

press_enter


# ============================================================================
# DONE
# ============================================================================
banner "DEMO COMPLETE"

echo -e "${GREEN}${BOLD}"
echo "  Demo tenant:  Acme Notifications $RUN_TAG ($DEMO_TENANT_ID)"
echo "  API key:      ${DEMO_KEY:0:30}..."
echo "  Rival tenant: Rival Corp $RUN_TAG ($RIVAL_TENANT_ID)"
echo ""
echo "  Services running:"
echo "    API Server:   http://localhost:$API_PORT"
echo "    Dashboard:    http://localhost:$DASHBOARD_PORT"
echo "    Mailpit:      http://localhost:$MAILPIT_UI_PORT"
echo "    ML Service:   http://localhost:$ML_SERVICE_PORT"
echo ""
echo "  Logs:"
echo "    API:       /tmp/ne-api.log"
echo "    Worker:    /tmp/ne-worker.log"
echo "    Dashboard: /tmp/ne-dashboard.log"
echo -e "${RESET}"
echo ""
echo -e "${YELLOW}  Press ENTER to shut down all services, or Ctrl+C to keep them running.${RESET}"
read -r

echo "Shutting down..."
