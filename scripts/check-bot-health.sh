#!/bin/bash
# MCbN Bot Health Check
# Checks Docker socket, bot container, web app, and bot heartbeat.
# Sends macOS notification and Discord webhook alert on failure.
# Designed to run as a macOS LaunchAgent every 5 minutes.
#
# Install: see scripts/com.mcbn.bot-health-check.plist

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BOT_ENV="${REPO_ROOT}/apps/bot/.env"
WEB_ENV="${REPO_ROOT}/apps/web/.env"

DOCKER_SOCKET="${HOME}/.docker/run/docker.sock"
CONTAINER_NAME="lasombra-bot"
WEB_URL="http://127.0.0.1:5001"
ALERT_COOLDOWN_FILE="/tmp/mcbn-health-last-alert"
ALERT_COOLDOWN_SECONDS=600   # 10 min between repeat alerts
HEARTBEAT_STALE_SECONDS=300  # 5 min = bot is considered frozen

# ── Helpers ──────────────────────────────────────────────────────────────────

parse_env() {
  local file="$1" key="$2"
  grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '\r'
}

in_cooldown() {
  [[ -f "$ALERT_COOLDOWN_FILE" ]] || return 1
  local age=$(( $(date +%s) - $(stat -f %m "$ALERT_COOLDOWN_FILE" 2>/dev/null || echo 0) ))
  [[ $age -lt $ALERT_COOLDOWN_SECONDS ]]
}

notify() {
  local title="$1" msg="$2"
  osascript -e "display notification \"${msg}\" with title \"${title}\" sound name \"Basso\"" 2>/dev/null || true
}

post_webhook() {
  local webhook="$1" msg="$2"
  [[ -z "$webhook" ]] && return 0
  curl -s -X POST "$webhook" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"🚨 **MCbN Bot Health Alert**\\n${msg}\"}" \
    --max-time 10 >/dev/null 2>&1 || true
}

alert() {
  local msg="$1"
  in_cooldown && return 0
  touch "$ALERT_COOLDOWN_FILE"
  notify "MCbN Bot Alert" "$msg"
  local webhook
  webhook=$(parse_env "$BOT_ENV" "HEALTH_ALERT_WEBHOOK")
  post_webhook "$webhook" "$msg"
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") ALERT: $msg"
}

ok() {
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") OK: $1"
}

# ── Checks ────────────────────────────────────────────────────────────────────

# 1. Docker socket
if ! curl -sf --unix-socket "${DOCKER_SOCKET}" "http://localhost/version" >/dev/null 2>&1; then
  alert "Docker Desktop is not responding. Bot container cannot be checked."
  exit 1
fi
ok "Docker socket responsive"

# 2. Bot container running
CONTAINER_STATE=$(curl -sf --unix-socket "${DOCKER_SOCKET}" \
  "http://localhost/containers/${CONTAINER_NAME}/json" 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['State']['Status'])" 2>/dev/null || echo "missing")

if [[ "$CONTAINER_STATE" != "running" ]]; then
  alert "Bot container '${CONTAINER_NAME}' is ${CONTAINER_STATE} (expected running)."
  exit 1
fi
ok "Bot container running"

# 3. Web app health
if ! curl -sf "${WEB_URL}/api/health" >/dev/null 2>&1; then
  alert "Web app at ${WEB_URL} is not responding."
  exit 1
fi
ok "Web app healthy"

# 4. Bot heartbeat freshness
API_TOKEN=$(parse_env "$WEB_ENV" "WEB_APP_API_TOKEN")
if [[ -n "$API_TOKEN" ]]; then
  HB_RESPONSE=$(curl -sf "${WEB_URL}/api/bot-heartbeat" \
    -H "Authorization: Bearer ${API_TOKEN}" \
    --max-time 10 2>/dev/null || echo "")

  if [[ -z "$HB_RESPONSE" ]]; then
    alert "Could not read bot heartbeat from web app."
  else
    AGE=$(echo "$HB_RESPONSE" | python3 -c \
      "import sys,json; d=json.load(sys.stdin); print(d.get('age_seconds') or -1)" 2>/dev/null || echo "-1")

    if [[ "$AGE" == "-1" || "$AGE" == "None" ]]; then
      alert "Bot has never sent a heartbeat. It may not be running or connected."
    elif [[ "$AGE" -gt "$HEARTBEAT_STALE_SECONDS" ]]; then
      MINS=$(( AGE / 60 ))
      alert "Bot heartbeat is stale (last seen ${MINS}m ago). Bot may be frozen or disconnected from Discord."
    else
      ok "Bot heartbeat fresh (${AGE}s ago)"
    fi
  fi
fi

exit 0
