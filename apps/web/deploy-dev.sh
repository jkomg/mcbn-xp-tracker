#!/bin/bash
# MCbN XP Tracker — Dev Cloud Run Deployment Script
#
# Deploys a separate "mcbn-xp-tracker-dev" Cloud Run service for testing.
# Uses SQLite (ephemeral), dev Discord app credentials, and dev secrets.
#
# Prerequisites:
#   ./setup-secrets-dev.sh   (run once before first deploy)
#
# Usage:
#   chmod +x deploy-dev.sh
#   ./deploy-dev.sh
#
# First run: deploys with a placeholder redirect URI, prints the real URL,
#   and instructs you to add it to your dev Discord app before re-running.
# Subsequent runs: auto-detects the existing service URL.

set -e

export PATH="/opt/homebrew/share/google-cloud-sdk/bin:/usr/local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

PROJECT_ID="mcbn-xp-tracker"
REGION="us-central1"
SERVICE_NAME="mcbn-xp-tracker-dev"
REPO="us-central1-docker.pkg.dev/${PROJECT_ID}/mcbn-repo"
IMAGE="${REPO}/${SERVICE_NAME}:latest"

# ── Detect existing service URL ───────────────────────────────────────────────
EXISTING_URL=""
if gcloud run services describe "${SERVICE_NAME}" \
     --project "${PROJECT_ID}" --region "${REGION}" &>/dev/null; then
  EXISTING_URL=$(gcloud run services describe "${SERVICE_NAME}" \
    --project "${PROJECT_ID}" --region "${REGION}" \
    --format="value(status.url)" 2>/dev/null || true)
fi

if [ -n "${EXISTING_URL}" ]; then
  REDIRECT_URI="${EXISTING_URL}/auth/callback"
  echo "==> Using existing service URL for redirect URI: ${REDIRECT_URI}"
else
  REDIRECT_URI="https://placeholder.example.com/auth/callback"
  echo "==> First deploy detected — using placeholder redirect URI."
  echo "    You will be prompted to update your dev Discord app after deploy."
fi

# ── Build ─────────────────────────────────────────────────────────────────────
echo ""
echo "==> Building Docker image (linux/amd64)..."
docker build \
  --platform linux/amd64 \
  -f "${SCRIPT_DIR}/Dockerfile" \
  -t "${IMAGE}" \
  "${REPO_ROOT}"

echo "==> Pushing to Artifact Registry..."
docker push "${IMAGE}"

# ── Deploy ────────────────────────────────────────────────────────────────────
echo "==> Deploying to Cloud Run (${SERVICE_NAME})..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 1 \
  --concurrency 80 \
  --timeout 120 \
  --cpu-throttling \
  --no-session-affinity \
  --startup-probe "httpGet.path=/api/health,httpGet.port=8080,initialDelaySeconds=0,timeoutSeconds=5,periodSeconds=5,failureThreshold=30" \
  --set-env-vars "FLASK_DEBUG=false" \
  --set-env-vars "AUTO_CREATE_PERIODS_ENABLED=true" \
  --set-env-vars "BOT_API_REPLAY_PROTECTION_ENABLED=false" \
  --set-env-vars "DISCORD_REDIRECT_URI=${REDIRECT_URI}" \
  --update-secrets "FLASK_SECRET_KEY=mcbn-dev-flask-secret:latest" \
  --update-secrets "DISCORD_CLIENT_ID=mcbn-dev-discord-client-id:latest" \
  --update-secrets "DISCORD_CLIENT_SECRET=mcbn-dev-discord-client-secret:latest" \
  --update-secrets "ALLOWED_DISCORD_IDS=mcbn-discord-allowed-ids:latest" \
  --update-secrets "SETTINGS_ADMIN_DISCORD_IDS=mcbn-settings-admin-ids:latest" \
  --update-secrets "WEB_APP_API_TOKEN=mcbn-dev-api-token:latest"

echo "==> Routing 100% traffic to latest revision..."
gcloud run services update-traffic "${SERVICE_NAME}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --to-latest

# ── Print URL ─────────────────────────────────────────────────────────────────
DEV_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --project "${PROJECT_ID}" --region "${REGION}" \
  --format="value(status.url)")

echo ""
echo "==> Dev service deployed!"
echo "    URL: ${DEV_URL}"
echo ""

if [ -z "${EXISTING_URL}" ]; then
  echo "============================================================"
  echo "  FIRST-RUN: Complete these steps before using the app:"
  echo ""
  echo "  1. Go to your dev Discord app at discord.com/developers"
  echo "  2. Under OAuth2 > Redirects, add:"
  echo "       ${DEV_URL}/auth/callback"
  echo "  3. Re-run this script: ./deploy-dev.sh"
  echo "     (It will now set the correct redirect URI automatically.)"
  echo "============================================================"
else
  echo "    Redirect URI: ${REDIRECT_URI}"
  echo "    (Confirm this is in your dev Discord app's OAuth2 redirects)"
fi
