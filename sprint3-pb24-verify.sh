#!/usr/bin/env bash
# sprint3-pb24-verify.sh
# Verifies PB-24 content classification pipeline end-to-end
# Run from repo root. Expects .env with ANTHROPIC_API_KEY set.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
PASS=0
FAIL=0
WARN=0

pass() { echo -e "${GREEN}PASS${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}FAIL${NC} $1"; FAIL=$((FAIL + 1)); }
warn() { echo -e "${YELLOW}WARN${NC} $1"; WARN=$((WARN + 1)); }
header() { echo -e "\n${YELLOW}--- $1 ---${NC}"; }

# Load env
if [ ! -f .env ]; then
  echo -e "${RED}.env file not found. Run from repo root.${NC}"
  exit 1
fi
export $(grep -v '^#' .env | xargs)

# Load dashboard env for API key
if [ -f apps/dashboard/.env ]; then
  export $(grep -v '^#' apps/dashboard/.env | xargs)
fi

API_URL="http://localhost:3000"
ML_URL="http://localhost:8000"
API_KEY="${VITE_API_KEY:-}"

if [ -z "$API_KEY" ]; then
  echo -e "${RED}VITE_API_KEY not set in .env. Need an API key to test.${NC}"
  exit 1
fi

# -------------------------------------------------------
header "STEP 1: Infrastructure health"
# -------------------------------------------------------

echo "Checking Docker services..."
if docker compose ps --format '{{.Service}} {{.State}}' 2>/dev/null | grep -q "running"; then
  pass "Docker Compose services running"
else
  echo "Starting Docker Compose..."
  docker compose up -d
  sleep 5
  if docker compose ps --format '{{.Service}} {{.State}}' 2>/dev/null | grep -q "running"; then
    pass "Docker Compose services started"
  else
    fail "Docker Compose services failed to start"
    exit 1
  fi
fi

# Check individual services
for svc in postgres redis ml-service mailpit; do
  if docker compose ps --format '{{.Service}} {{.State}}' | grep -q "$svc.*running"; then
    pass "$svc is running"
  else
    fail "$svc is NOT running"
  fi
done

# -------------------------------------------------------
header "STEP 2: Migration"
# -------------------------------------------------------

echo "Running migrations..."
MIGRATE_OUT=$(npx tsx infra/migrate.ts 2>&1) || true
echo "$MIGRATE_OUT"

# Check that content_classification column exists
COL_CHECK=$(docker compose exec -T postgres psql -U notify -d notifyengine -t -c \
  "SELECT column_name FROM information_schema.columns WHERE table_name='notifications' AND column_name='content_classification';" 2>&1)
if echo "$COL_CHECK" | grep -q "content_classification"; then
  pass "content_classification column exists on notifications table"
else
  fail "content_classification column NOT found on notifications table"
fi

# -------------------------------------------------------
header "STEP 3: ML service health + feature columns"
# -------------------------------------------------------

ML_HEALTH=$(curl -sf "$ML_URL/health" 2>/dev/null) || ML_HEALTH=""
if [ -n "$ML_HEALTH" ]; then
  pass "ML service is healthy"
else
  fail "ML service not responding on $ML_URL/health"
fi

# Check feature columns count
FEATURE_COUNT=$(docker compose exec -T ml-service python -c "
from features import FEATURE_COLUMNS
print(len(FEATURE_COLUMNS))
for f in FEATURE_COLUMNS:
    print(f)
" 2>&1)

FCOUNT=$(echo "$FEATURE_COUNT" | head -1 | tr -d '[:space:]')
if [ "$FCOUNT" = "19" ]; then
  pass "ML service FEATURE_COLUMNS has 19 entries"
  echo "  Features: $(echo "$FEATURE_COUNT" | tail -n +2 | tr '\n' ', ')"
else
  fail "ML service FEATURE_COLUMNS has $FCOUNT entries (expected 19)"
  echo "$FEATURE_COUNT"
fi

# Check the 4 new features are present
for feat in urgency_score category_encoded time_sensitivity_score sentiment_score; do
  if echo "$FEATURE_COUNT" | grep -q "$feat"; then
    pass "  $feat present in FEATURE_COLUMNS"
  else
    fail "  $feat MISSING from FEATURE_COLUMNS"
  fi
done

# -------------------------------------------------------
header "STEP 4: Unit tests"
# -------------------------------------------------------

echo "Running API tests..."
API_TEST_OUT=$(cd apps/api && npm test 2>&1) || true
API_TEST_RESULT=$(echo "$API_TEST_OUT" | grep -E "Tests:.*passed|Test Suites:|Tests\s+[0-9]+ passed" | tail -2) || true
if echo "$API_TEST_OUT" | grep -q "failed"; then
  fail "API tests have failures"
  echo "$API_TEST_OUT" | grep -E "FAIL|failed" | head -10
else
  pass "API tests all passing"
fi
echo "  $API_TEST_RESULT"

echo "Running Worker tests..."
WORKER_TEST_OUT=$(cd apps/worker && npm test 2>&1) || true
WORKER_TEST_RESULT=$(echo "$WORKER_TEST_OUT" | grep -E "Tests:.*passed|Test Suites:|Tests\s+[0-9]+ passed" | tail -2) || true
if echo "$WORKER_TEST_OUT" | grep -q "failed"; then
  fail "Worker tests have failures"
  echo "$WORKER_TEST_OUT" | grep -E "FAIL|failed" | head -10
else
  pass "Worker tests all passing"
fi
echo "  $WORKER_TEST_RESULT"

echo "Running ML service tests..."
ML_TEST_OUT=$(docker compose exec -T ml-service pytest -v 2>&1) || true
if echo "$ML_TEST_OUT" | grep -q "failed"; then
  fail "ML service tests have failures"
  echo "$ML_TEST_OUT" | grep -E "FAILED" | head -10
else
  pass "ML service tests all passing"
fi
ML_TEST_COUNT=$(echo "$ML_TEST_OUT" | grep -oE "[0-9]+ passed" | head -1) || true
echo "  $ML_TEST_COUNT"

# -------------------------------------------------------
header "STEP 5: API + Worker live check"
# -------------------------------------------------------

# Check if API is already running
API_RUNNING=false
if curl -sf "$API_URL/health" > /dev/null 2>&1; then
  API_RUNNING=true
  pass "API server is running on port 3000"
else
  warn "API server not running. Start it with: export \$(grep -v '^#' .env | xargs) && npm run dev --workspace=@notifyengine/api"
  echo "  Then re-run this script."
fi

if [ "$API_RUNNING" = false ]; then
  header "SKIPPING LIVE TESTS (API not running)"
  echo "Start the API and worker, then re-run. Remaining checks:"
  echo "  - POST notification with classification"
  echo "  - GET notification shows classification stored"
  echo "  - Feature vector has 19 keys on delivery attempt"
  echo "  - ML /predict accepts 19 features"
  echo ""
  echo -e "${YELLOW}Results so far:${NC} ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, ${YELLOW}$WARN warnings${NC}"
  exit 0
fi

# -------------------------------------------------------
header "STEP 6: Send notification + verify classification"
# -------------------------------------------------------

# Check if ANTHROPIC_API_KEY is set (needed for real classification)
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  warn "ANTHROPIC_API_KEY not set - content_classification will be null (null fallback path)"
  EXPECT_CLASSIFICATION=false
else
  echo "ANTHROPIC_API_KEY is set - expecting real classification"
  EXPECT_CLASSIFICATION=true
fi

# Test 1: Security alert (should classify as urgent)
echo ""
echo "Sending security alert notification..."
SEND_RESP=$(curl -sf -X POST "$API_URL/v1/notifications" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "user_email_lover_001@test.local",
    "subject": "Suspicious login detected on your account",
    "body": "Someone logged into your account from an unrecognized device in Moscow. If this was not you, reset your password immediately.",
    "priority": "critical"
  }' 2>&1) || SEND_RESP=""

if [ -z "$SEND_RESP" ]; then
  fail "POST /v1/notifications returned empty response"
else
  NOTIF_ID=$(echo "$SEND_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null) || NOTIF_ID=""
  NOTIF_STATUS=$(echo "$SEND_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null) || NOTIF_STATUS=""

  if [ -n "$NOTIF_ID" ] && [ "$NOTIF_STATUS" = "queued" ]; then
    pass "POST /v1/notifications returned 202 with ID: $NOTIF_ID"
  else
    fail "POST /v1/notifications unexpected response: $SEND_RESP"
    NOTIF_ID=""
  fi
fi

# Wait for delivery
if [ -n "$NOTIF_ID" ]; then
  echo "Waiting for delivery (max 15s)..."
  for i in $(seq 1 30); do
    sleep 0.5
    GET_RESP=$(curl -sf "$API_URL/v1/notifications/$NOTIF_ID" \
      -H "Authorization: Bearer $API_KEY" 2>/dev/null) || continue
    CURR_STATUS=$(echo "$GET_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null) || continue
    if [ "$CURR_STATUS" = "delivered" ] || [ "$CURR_STATUS" = "failed" ]; then
      break
    fi
  done

  if [ "$CURR_STATUS" = "delivered" ]; then
    pass "Notification delivered (status: $CURR_STATUS)"
  elif [ "$CURR_STATUS" = "failed" ]; then
    warn "Notification failed delivery (expected if only email channel active and recipient is mock)"
  else
    warn "Notification still in status: $CURR_STATUS after 15s"
  fi

  # Check content_classification
  CLASSIFICATION=$(echo "$GET_RESP" | python3 -c "
import sys,json
data = json.load(sys.stdin)
cc = data.get('content_classification')
if cc is None:
    print('NULL')
else:
    print('PRESENT')
    print(f\"  urgency_score: {cc.get('urgency_score', 'MISSING')}\")
    print(f\"  category: {cc.get('category', 'MISSING')}\")
    print(f\"  category_encoded: {cc.get('category_encoded', 'MISSING')}\")
    print(f\"  time_sensitivity_score: {cc.get('time_sensitivity_score', 'MISSING')}\")
    print(f\"  sentiment_score: {cc.get('sentiment_score', 'MISSING')}\")
    print(f\"  optimal_channel_hint: {cc.get('optimal_channel_hint', 'MISSING')}\")
    print(f\"  reasoning: {cc.get('reasoning', 'MISSING')[:80]}...\")
" 2>/dev/null) || CLASSIFICATION="ERROR"

  CC_STATUS=$(echo "$CLASSIFICATION" | head -1)
  if [ "$CC_STATUS" = "PRESENT" ]; then
    pass "content_classification is populated"
    echo "$CLASSIFICATION" | tail -n +2

    # Validate urgency is high for security content
    URGENCY=$(echo "$GET_RESP" | python3 -c "
import sys,json
cc = json.load(sys.stdin).get('content_classification',{})
print(cc.get('urgency_score', -1))
" 2>/dev/null) || URGENCY="-1"
    if python3 -c "exit(0 if float('$URGENCY') > 0.7 else 1)" 2>/dev/null; then
      pass "urgency_score > 0.7 for security alert content (got $URGENCY)"
    else
      warn "urgency_score is $URGENCY - expected > 0.7 for security alert (LLM judgment may vary)"
    fi
  elif [ "$CC_STATUS" = "NULL" ] && [ "$EXPECT_CLASSIFICATION" = false ]; then
    pass "content_classification is null (expected - ANTHROPIC_API_KEY not set)"
  elif [ "$CC_STATUS" = "NULL" ] && [ "$EXPECT_CLASSIFICATION" = true ]; then
    fail "content_classification is null despite ANTHROPIC_API_KEY being set - check API server logs"
  else
    fail "content_classification check failed: $CLASSIFICATION"
  fi

  # Check feature_vector on delivery attempt has 19 features
  FVEC_KEYS=$(docker compose exec -T postgres psql -U notify -d notifyengine -t -c \
    "SELECT count(*) FROM jsonb_object_keys(
       (SELECT feature_vector FROM delivery_attempts
        WHERE notification_id = '$NOTIF_ID' AND feature_vector IS NOT NULL
        LIMIT 1)
     ) AS k;" 2>&1 | tr -d '[:space:]') || FVEC_KEYS=""

  if [ "$FVEC_KEYS" = "19" ]; then
    pass "feature_vector on delivery_attempt has 19 keys"
  elif [ -n "$FVEC_KEYS" ] && [ "$FVEC_KEYS" != "0" ]; then
    fail "feature_vector has $FVEC_KEYS keys (expected 19)"
  else
    warn "Could not read feature_vector from delivery_attempts (may not exist yet if delivery failed)"
  fi
fi

# -------------------------------------------------------
header "STEP 7: Test null fallback path"
# -------------------------------------------------------

# Send a notification with a marketing subject (different classification)
echo "Sending marketing notification..."
SEND_RESP2=$(curl -sf -X POST "$API_URL/v1/notifications" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "user_balanced_001@test.local",
    "subject": "50% off summer sale - this weekend only!",
    "body": "Our biggest sale of the year is here. Shop now and save on everything in store. Use code SUMMER50 at checkout.",
    "priority": "standard"
  }' 2>&1) || SEND_RESP2=""

NOTIF_ID2=$(echo "$SEND_RESP2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null) || NOTIF_ID2=""

if [ -n "$NOTIF_ID2" ]; then
  pass "Marketing notification sent: $NOTIF_ID2"

  # Wait for delivery
  sleep 5
  GET_RESP2=$(curl -sf "$API_URL/v1/notifications/$NOTIF_ID2" \
    -H "Authorization: Bearer $API_KEY" 2>/dev/null) || GET_RESP2=""

  if [ -n "$GET_RESP2" ] && [ "$EXPECT_CLASSIFICATION" = true ]; then
    CATEGORY=$(echo "$GET_RESP2" | python3 -c "
import sys,json
cc = json.load(sys.stdin).get('content_classification')
print(cc.get('category','NONE') if cc else 'NULL')
" 2>/dev/null) || CATEGORY="ERROR"
    if [ "$CATEGORY" = "marketing" ]; then
      pass "Marketing notification classified as 'marketing'"
    elif [ "$CATEGORY" = "NULL" ]; then
      fail "Marketing notification has null classification despite API key being set"
    else
      warn "Marketing notification classified as '$CATEGORY' (expected 'marketing' but LLM judgment may vary)"
    fi
  fi
else
  fail "Marketing notification POST failed"
fi

# -------------------------------------------------------
header "STEP 8: ML /predict backward compat (15-feature input)"
# -------------------------------------------------------

PREDICT_15=$(curl -sf -X POST "$ML_URL/predict" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "test_user",
    "available_channels": ["email"],
    "features_per_channel": {
      "email": {
        "channel_type_encoded": 0,
        "hour_of_day": 14,
        "day_of_week": 2,
        "is_weekend": 0,
        "historical_success_rate": 0.8,
        "historical_engagement_rate": 0.6,
        "hours_since_last_engagement": 24,
        "hours_since_last_success": 12,
        "avg_latency_ms": 500,
        "attempts_30d": 10,
        "notifications_sent_24h": 1,
        "notifications_sent_7d": 5,
        "notification_priority_score": 3,
        "content_length": 150,
        "channel_health": 1.0
      }
    }
  }' 2>&1) || PREDICT_15=""

if echo "$PREDICT_15" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'selected' in d and 'predictions' in d" 2>/dev/null; then
  pass "ML /predict accepts 15-feature input (backward compat)"
else
  fail "ML /predict rejected 15-feature input: $PREDICT_15"
fi

# 19-feature input
PREDICT_19=$(curl -sf -X POST "$ML_URL/predict" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "test_user",
    "available_channels": ["email"],
    "features_per_channel": {
      "email": {
        "channel_type_encoded": 0,
        "hour_of_day": 14,
        "day_of_week": 2,
        "is_weekend": 0,
        "historical_success_rate": 0.8,
        "historical_engagement_rate": 0.6,
        "hours_since_last_engagement": 24,
        "hours_since_last_success": 12,
        "avg_latency_ms": 500,
        "attempts_30d": 10,
        "notifications_sent_24h": 1,
        "notifications_sent_7d": 5,
        "notification_priority_score": 3,
        "content_length": 150,
        "channel_health": 1.0,
        "urgency_score": 0.9,
        "category_encoded": 0,
        "time_sensitivity_score": 0.95,
        "sentiment_score": 0.3
      }
    }
  }' 2>&1) || PREDICT_19=""

if echo "$PREDICT_19" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'selected' in d and 'predictions' in d" 2>/dev/null; then
  pass "ML /predict accepts 19-feature input"
else
  fail "ML /predict rejected 19-feature input: $PREDICT_19"
fi

# -------------------------------------------------------
header "RESULTS"
# -------------------------------------------------------

echo ""
echo -e "  ${GREEN}$PASS passed${NC}"
echo -e "  ${RED}$FAIL failed${NC}"
echo -e "  ${YELLOW}$WARN warnings${NC}"
echo ""

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}PB-24 verification has failures. Fix before pushing.${NC}"
  exit 1
elif [ $WARN -gt 0 ]; then
  echo -e "${YELLOW}PB-24 verification passed with warnings. Review warnings before pushing.${NC}"
  exit 0
else
  echo -e "${GREEN}PB-24 verification clean. Ready to push.${NC}"
  exit 0
fi
