#!/bin/bash
# MCbN XP Tracker — GCP Secret Manager Sync
#
# Reads values from .env and syncs them to GCP Secret Manager.
# Only adds a new version when the value has changed.
# Safe to re-run any time .env is updated.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Project set: gcloud config set project mcbn-xp-tracker
#   - Secret Manager API enabled:
#       gcloud services enable secretmanager.googleapis.com

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ID="mcbn-xp-tracker"
ENV_FILE="${SCRIPT_DIR}/.env"

if [ ! -f "${ENV_FILE}" ]; then
  echo "ERROR: ${ENV_FILE} not found."
  exit 1
fi

# Read a value from .env
_env_val() {
  grep "^${1}=" "${ENV_FILE}" | cut -d'=' -f2- | tr -d '\r'
}

echo "==> Enabling Secret Manager API..."
gcloud services enable secretmanager.googleapis.com --project="${PROJECT_ID}" --quiet

echo ""
echo "==> Syncing secrets from .env to GCP Secret Manager..."
echo "    (Only updates secrets whose value has changed.)"
echo ""

# Create or update a secret — skips if value is unchanged
upsert_secret() {
  local name="$1"
  local value="$2"

  if [ -z "${value}" ]; then
    echo "  SKIP ${name} (empty in .env)"
    return
  fi

  local current
  current=$(gcloud secrets versions access latest --secret="${name}" --project="${PROJECT_ID}" 2>/dev/null || true)

  if [ "${current}" = "${value}" ]; then
    echo "  OK   ${name} (unchanged)"
    return
  fi

  echo -n "${value}" | gcloud secrets create "${name}" \
    --data-file=- --project="${PROJECT_ID}" 2>/dev/null || \
  echo -n "${value}" | gcloud secrets versions add "${name}" \
    --data-file=- --project="${PROJECT_ID}"
  echo "  ✓    ${name} (updated)"
}

# Flask
upsert_secret "mcbn-flask-secret"          "$(_env_val FLASK_SECRET_KEY)"

# Google service account credentials (JSON file — not in .env, read from disk)
SA_FILE="${SCRIPT_DIR}/credentials/service-account.json"
if [ -f "${SA_FILE}" ]; then
  SA_CURRENT=$(gcloud secrets versions access latest --secret="mcbn-google-creds" --project="${PROJECT_ID}" 2>/dev/null || true)
  SA_NEW=$(cat "${SA_FILE}")
  if [ "${SA_CURRENT}" = "${SA_NEW}" ]; then
    echo "  OK   mcbn-google-creds (unchanged)"
  else
    gcloud secrets create mcbn-google-creds \
      --data-file="${SA_FILE}" --project="${PROJECT_ID}" 2>/dev/null || \
    gcloud secrets versions add mcbn-google-creds \
      --data-file="${SA_FILE}" --project="${PROJECT_ID}"
    echo "  ✓    mcbn-google-creds (updated)"
  fi
else
  echo "  SKIP mcbn-google-creds (${SA_FILE} not found)"
fi

# Discord OAuth
upsert_secret "mcbn-discord-client-id"     "$(_env_val DISCORD_CLIENT_ID)"
upsert_secret "mcbn-discord-client-secret" "$(_env_val DISCORD_CLIENT_SECRET)"
upsert_secret "mcbn-discord-allowed-ids"   "$(_env_val ALLOWED_DISCORD_IDS)"

# Bot API token
upsert_secret "mcbn-web-app-api-token"     "$(_env_val WEB_APP_API_TOKEN)"

# Database (Turso)
upsert_secret "mcbn-database-url"          "$(_env_val DATABASE_URL)"
upsert_secret "mcbn-turso-auth-token"      "$(_env_val TURSO_AUTH_TOKEN)"

# Grant Cloud Run service account access to all secrets
echo ""
echo "==> Granting Cloud Run service account access..."
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
SA_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for SECRET in mcbn-flask-secret mcbn-google-creds \
              mcbn-discord-client-id mcbn-discord-client-secret mcbn-discord-allowed-ids \
              mcbn-web-app-api-token mcbn-database-url mcbn-turso-auth-token; do
  gcloud secrets add-iam-policy-binding "${SECRET}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT_ID}" --quiet 2>/dev/null || true
done
echo "  ✓ All secrets accessible by Cloud Run"

echo ""
echo "=== Done! Run ./deploy.sh to deploy. ==="
