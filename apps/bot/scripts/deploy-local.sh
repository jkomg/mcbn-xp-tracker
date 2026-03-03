#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "ERROR: apps/bot/.env not found."
  echo "Copy apps/bot/.env.example to apps/bot/.env and set required values first."
  exit 1
fi

# shellcheck disable=SC1091
source .env

if [[ -z "${BOT_TOKEN:-}" || -z "${CLIENT_ID:-}" ]]; then
  echo "ERROR: BOT_TOKEN and CLIENT_ID are required in apps/bot/.env"
  exit 1
fi

if [[ -n "${WEB_APP_BASE_URL:-}" ]]; then
  echo "Checking web app health at ${WEB_APP_BASE_URL}/api/health ..."
  curl -fsS "${WEB_APP_BASE_URL}/api/health" >/dev/null
fi

echo "Installing dependencies..."
npm ci

echo "Building bot..."
npm run build

if command -v systemctl >/dev/null 2>&1; then
  echo "Detected systemd. Restarting mcbn-tracker-bot service..."
  sudo systemctl restart mcbn-tracker-bot
  sudo systemctl status mcbn-tracker-bot --no-pager -l || true
elif command -v launchctl >/dev/null 2>&1; then
  LABEL="us.mcbn.tracker-bot"
  echo "Detected launchd. Restarting ${LABEL} ..."
  launchctl kickstart -k "gui/$(id -u)/${LABEL}" || true
  launchctl print "gui/$(id -u)/${LABEL}" | head -n 40 || true
else
  echo "No system service manager found; starting in foreground with npm start"
  npm start
fi

echo "Done."
