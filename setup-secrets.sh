#!/bin/bash
# MCbN XP Tracker — One-time GCP Secrets Setup
# This stores your sensitive config in Google Secret Manager (free tier).
# Run this ONCE before your first deploy.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Project set: gcloud config set project mcbn-xp-tracker
#   - Secret Manager API enabled:
#       gcloud services enable secretmanager.googleapis.com

set -e

PROJECT_ID="mcbn-xp-tracker"

echo "==> Enabling Secret Manager API..."
gcloud services enable secretmanager.googleapis.com --project="${PROJECT_ID}"

echo ""
echo "==> Creating secrets..."
echo "(If a secret already exists, it will add a new version.)"
echo ""

# Helper: create or update a secret
upsert_secret() {
  local name="$1"
  local value="$2"
  echo -n "${value}" | gcloud secrets create "${name}" \
    --data-file=- --project="${PROJECT_ID}" 2>/dev/null || \
  echo -n "${value}" | gcloud secrets versions add "${name}" \
    --data-file=- --project="${PROJECT_ID}"
  echo "  ✓ ${name}"
}

# Flask secret key — generate a strong random one for production
FLASK_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
upsert_secret "mcbn-flask-secret" "${FLASK_SECRET}"

# Spreadsheet ID
upsert_secret "mcbn-spreadsheet-id" "1nCBYmXyUcrY-RhqTlH46M3C3HCFDBIfJXaurfTk55w0"

# Google service account credentials (the JSON file)
SA_FILE="credentials/service-account.json"
if [ ! -f "${SA_FILE}" ]; then
  echo "ERROR: ${SA_FILE} not found. Run this from the project root."
  exit 1
fi
gcloud secrets create mcbn-google-creds \
  --data-file="${SA_FILE}" --project="${PROJECT_ID}" 2>/dev/null || \
gcloud secrets versions add mcbn-google-creds \
  --data-file="${SA_FILE}" --project="${PROJECT_ID}"
echo "  ✓ mcbn-google-creds"

# Discord OAuth2
echo ""
echo "--- Discord OAuth Setup ---"
echo "Create an app at https://discord.com/developers/applications"
echo "Under OAuth2, add redirect URL: https://xp.jkomg.us/auth/callback"
echo ""

read -p "Enter Discord Client ID: " DISCORD_CID
upsert_secret "mcbn-discord-client-id" "${DISCORD_CID}"

read -sp "Enter Discord Client Secret: " DISCORD_CSECRET
echo ""
upsert_secret "mcbn-discord-client-secret" "${DISCORD_CSECRET}"

echo ""
echo "Enter the Discord user IDs allowed staff access (comma-separated)."
echo "Find your ID: Discord Settings → Advanced → Developer Mode ON, then"
echo "right-click your name → Copy User ID."
read -p "Allowed Discord IDs: " DISCORD_IDS
upsert_secret "mcbn-discord-allowed-ids" "${DISCORD_IDS}"

# Grant Cloud Run access to all secrets
echo ""
echo "==> Granting Cloud Run service account access to secrets..."
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
SA_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for SECRET in mcbn-flask-secret mcbn-spreadsheet-id mcbn-google-creds \
              mcbn-discord-client-id mcbn-discord-client-secret mcbn-discord-allowed-ids; do
  gcloud secrets add-iam-policy-binding "${SECRET}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT_ID}" --quiet
done
echo "  ✓ All secrets accessible by Cloud Run"

echo ""
echo "=== Done! Now run: ./deploy.sh ==="
