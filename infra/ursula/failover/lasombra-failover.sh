#!/bin/bash
# Lasombra bot failover — starts local OrbStack bot if Ursula's bot heartbeat goes stale.
# Stops local bot automatically when Ursula recovers.

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

MCBN_URL="https://mcbn.jkomg.us"
MCBN_TOKEN="YOUR_MCBN_API_TOKEN_HERE"
BOT_DIR="/Users/jasonkennedy/Projects/mcbn-xp-tracker/apps/bot"
STALE_SECONDS=600   # 10 min — matches Ursula health check threshold
LOG_PREFIX="$(date -u +"%Y-%m-%dT%H:%M:%SZ") [lasombra-failover]"

local_bot_running() {
  docker ps --filter name=lasombra-bot --filter status=running --format '{{.Names}}' 2>/dev/null | grep -q lasombra-bot
}

# Fetch heartbeat
response=$(curl -sf "${MCBN_URL}/api/bot-heartbeat" \
  -H "Authorization: Bearer ${MCBN_TOKEN}" \
  --max-time 10 2>/dev/null || echo "")

if [[ -z "$response" ]]; then
  echo "${LOG_PREFIX} Could not reach web app — skipping"
  exit 0
fi

age=$(echo "$response" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('age_seconds') if d.get('age_seconds') is not None else -1)" \
  2>/dev/null || echo "-1")

if [[ "$age" == "-1" || "$age" -gt "$STALE_SECONDS" ]]; then
  if local_bot_running; then
    echo "${LOG_PREFIX} Heartbeat stale (${age}s) — local failover already running"
  else
    echo "${LOG_PREFIX} Heartbeat stale (${age}s) — starting local failover bot"
    cd "$BOT_DIR" && docker compose up -d
  fi
else
  if local_bot_running; then
    echo "${LOG_PREFIX} Ursula bot recovered (${age}s) — stopping local failover"
    cd "$BOT_DIR" && docker compose down
  else
    echo "${LOG_PREFIX} OK (${age}s)"
  fi
fi
