#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "ERROR: apps/bot/.env not found."
  exit 1
fi

# shellcheck disable=SC1091
source .env

if [[ -z "${WEB_APP_BASE_URL:-}" ]]; then
  echo "ERROR: WEB_APP_BASE_URL is required in apps/bot/.env"
  exit 1
fi

echo "Health: ${WEB_APP_BASE_URL}/api/health"
curl -fsS "${WEB_APP_BASE_URL}/api/health" | sed -n '1,3p'

if [[ -n "${WEB_APP_API_TOKEN:-}" ]]; then
  echo "Claim context (auth): ${WEB_APP_BASE_URL}/api/meta/claim-context"
  curl -fsS -H "Authorization: Bearer ${WEB_APP_API_TOKEN}" "${WEB_APP_BASE_URL}/api/meta/claim-context" | sed -n '1,5p'
else
  echo "WEB_APP_API_TOKEN not set; skipping authenticated check"
fi
