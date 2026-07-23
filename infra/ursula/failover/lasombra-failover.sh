#!/bin/bash
# Lasombra bot failover — starts local OrbStack bot if Ursula's bot heartbeat goes stale.
# Stops local bot automatically when Ursula recovers.

set -uo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

MCBN_URL="https://mcbn.jkomg.us"
MCBN_TOKEN="YOUR_MCBN_API_TOKEN_HERE"
# Must match the actual local clone path on the failover host -- a wrong path
# here makes `cd "$BOT_DIR" && docker compose ...` silently no-op (the `&&`
# short-circuits on a failed cd), so this whole failover mechanism looks like
# it's working in the logs while never actually starting/stopping anything.
BOT_DIR="/Users/jasonkennedy/mcbn-failover/mcbn-xp-tracker/apps/bot"
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
  elif cd "$BOT_DIR" 2>/dev/null && docker compose up -d >/dev/null 2>&1; then
    echo "${LOG_PREFIX} Heartbeat stale (${age}s) — started local failover bot"
  else
    echo "${LOG_PREFIX} ERROR: heartbeat stale (${age}s) but failed to start local failover bot (check BOT_DIR=${BOT_DIR} and docker)"
  fi
else
  if local_bot_running; then
    if cd "$BOT_DIR" 2>/dev/null && docker compose down >/dev/null 2>&1; then
      echo "${LOG_PREFIX} Ursula bot recovered (${age}s) — stopped local failover"
    else
      echo "${LOG_PREFIX} ERROR: Ursula bot recovered (${age}s) but failed to stop local failover bot (check BOT_DIR=${BOT_DIR} and docker)"
    fi
  else
    echo "${LOG_PREFIX} OK (${age}s)"
  fi
fi
