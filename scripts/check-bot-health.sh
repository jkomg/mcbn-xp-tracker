#!/bin/bash
# MCbN Bot Health Check
# Checks Docker socket, bot container, web app, and bot heartbeat.
# Sends a macOS notification on failure.
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
# Use the bot's own WEB_APP_BASE_URL so heartbeat checks hit the same web app
# the bot actually talks to (prod). Falls back to local dev if not set.
WEB_URL="$(grep -E '^WEB_APP_BASE_URL=' "${BOT_ENV}" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '\r')"
WEB_URL="${WEB_URL:-http://127.0.0.1:5001}"
ALERT_COOLDOWN_FILE="/tmp/mcbn-health-last-alert"
ALERT_COOLDOWN_SECONDS=600   # 10 min between repeat alerts
HEARTBEAT_STALE_SECONDS=600  # 10 min (~9 missed beats) = bot is considered frozen

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


alert() {
  local msg="$1"
  in_cooldown && return 0
  touch "$ALERT_COOLDOWN_FILE"
  notify "MCbN Bot Alert" "$msg"
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
API_TOKEN=$(parse_env "$BOT_ENV" "WEB_APP_API_TOKEN")
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

# 5. Duplicate bot process guard — checked last so it never blocks higher-priority alerts.
# Running the launchd native bot alongside the Docker container causes duplicate notifications.
if pgrep -f "node dist/index" >/dev/null 2>&1; then
  alert "Duplicate bot detected: a native 'node dist/index' process is running alongside the Docker container. Stop it with: launchctl unload ~/Library/LaunchAgents/us.mcbn.tracker-bot.plist"
fi

exit 0
