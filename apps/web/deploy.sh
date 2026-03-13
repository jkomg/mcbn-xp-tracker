#!/bin/bash
# MCbN XP Tracker — Cloud Run Deployment Script
# Run this after completing the one-time GCP setup below.
#
# ============================================================
# ONE-TIME GCP SETUP (do these steps first, only once):
# ============================================================
#
# 1. Install Google Cloud CLI (if not already installed):
#      brew install google-cloud-sdk
#
# 2. Log in and create/select a project:
#      gcloud auth login
#      gcloud projects create mcbn-xp-tracker --name="MCbN XP Tracker"
#      gcloud config set project mcbn-xp-tracker
#
#    NOTE: If "mcbn-xp-tracker" is taken, use a unique name and update
#    PROJECT_ID below.
#
# 3. Enable required APIs (free):
#      gcloud services enable run.googleapis.com
#      gcloud services enable artifactregistry.googleapis.com
#
# 4. Create Artifact Registry repo (stores your Docker images, free tier):
#      gcloud artifacts repositories create mcbn-repo \
#        --repository-format=docker \
#        --location=us-central1
#
# 5. Configure Docker to push to Artifact Registry:
#      gcloud auth configure-docker us-central1-docker.pkg.dev
#
# ============================================================
# After the above, run this script to deploy (or re-deploy):
#   ./deploy.sh
# ============================================================

set -e

# Ensure gcloud and docker are in PATH
export PATH="/opt/homebrew/share/google-cloud-sdk/bin:/usr/local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

PROJECT_ID="mcbn-xp-tracker"
REGION="us-central1"
SERVICE_NAME="mcbn-xp-tracker"
REPO="us-central1-docker.pkg.dev/${PROJECT_ID}/mcbn-repo"
IMAGE="${REPO}/${SERVICE_NAME}:latest"
SPREADSHEET_ID_VALUE="${SPREADSHEET_ID:-$(grep '^SPREADSHEET_ID=' "${SCRIPT_DIR}/.env" 2>/dev/null | cut -d'=' -f2-)}"

if [ -z "${SPREADSHEET_ID_VALUE}" ]; then
  echo "ERROR: SPREADSHEET_ID is required."
  echo "Set it in your environment or in .env before running deploy.sh."
  exit 1
fi

echo "==> Building Docker image (linux/amd64 for Cloud Run)..."
docker build \
  --platform linux/amd64 \
  -f "${SCRIPT_DIR}/Dockerfile" \
  -t "${IMAGE}" \
  "${REPO_ROOT}"

echo "==> Pushing to Artifact Registry..."
docker push "${IMAGE}"

echo "==> Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2 \
  --set-env-vars "FLASK_DEBUG=false" \
  --set-env-vars "SPREADSHEET_ID=${SPREADSHEET_ID_VALUE}" \
  --set-env-vars "SHEETS_CACHE_TTL=30" \
  --set-env-vars "AUTO_CREATE_PERIODS_ENABLED=true" \
  --set-env-vars "DISCORD_REDIRECT_URI=https://mcbn.jkomg.us/auth/callback" \
  --update-secrets "FLASK_SECRET_KEY=mcbn-flask-secret:latest" \
  --update-secrets "GOOGLE_CREDENTIALS_JSON=mcbn-google-creds:latest" \
  --update-secrets "DISCORD_CLIENT_ID=mcbn-discord-client-id:latest" \
  --update-secrets "DISCORD_CLIENT_SECRET=mcbn-discord-client-secret:latest" \
  --update-secrets "ALLOWED_DISCORD_IDS=mcbn-discord-allowed-ids:latest" \
  --update-secrets "WEB_APP_API_TOKEN=mcbn-web-app-api-token:latest" \
  --update-secrets "DATABASE_URL=mcbn-database-url:latest" \
  --update-secrets "TURSO_AUTH_TOKEN=mcbn-turso-auth-token:latest"

echo ""
echo "==> Deployed! Your app URL:"
gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format="value(status.url)"
