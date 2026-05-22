#!/bin/bash
# MCbN XP Tracker — Dev Cloud Run Secret Setup
#
# Run this ONCE before your first deploy-dev.sh.
# Creates GCP secrets for the dev service.
# Reuses prod's ALLOWED_DISCORD_IDS and SETTINGS_ADMIN_DISCORD_IDS.
#
# Usage:
#   chmod +x setup-secrets-dev.sh
#   ./setup-secrets-dev.sh

set -e
export PATH="/opt/homebrew/share/google-cloud-sdk/bin:/usr/local/bin:$PATH"

PROJECT_ID="mcbn-xp-tracker"

upsert_secret() {
  local name="$1"
  local value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT_ID" &>/dev/null; then
    echo "  updating $name..."
    echo -n "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT_ID"
  else
    echo "  creating $name..."
    echo -n "$value" | gcloud secrets create "$name" --data-file=- --project="$PROJECT_ID"
  fi
}

echo "=== MCbN Dev Secrets Setup ==="
echo ""

# Generate random values
FLASK_SECRET=$(openssl rand -hex 32)
API_TOKEN=$(openssl rand -hex 24)

echo "Enter your DEV Discord app Client ID:"
read -r DEV_CLIENT_ID
echo ""

echo "Enter your DEV Discord app Client Secret:"
read -r -s DEV_CLIENT_SECRET
echo ""
echo ""

upsert_secret "mcbn-dev-flask-secret"          "$FLASK_SECRET"
upsert_secret "mcbn-dev-discord-client-id"     "$DEV_CLIENT_ID"
upsert_secret "mcbn-dev-discord-client-secret" "$DEV_CLIENT_SECRET"
upsert_secret "mcbn-dev-api-token"             "$API_TOKEN"

echo ""
echo "=== Granting Secret Accessor to Cloud Run service account ==="
SA=$(gcloud iam service-accounts list \
  --project="${PROJECT_ID}" \
  --filter="displayName:Compute Engine default service account" \
  --format="value(email)" 2>/dev/null || true)
if [ -z "${SA}" ]; then
  # Fall back to the default compute SA naming convention
  PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
  SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi
echo "  Service account: ${SA}"
for secret in mcbn-dev-flask-secret mcbn-dev-discord-client-id mcbn-dev-discord-client-secret mcbn-dev-api-token; do
  gcloud secrets add-iam-policy-binding "${secret}" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet
  echo "  granted: ${secret}"
done

echo ""
echo "=== Done ==="
echo ""
echo "Dev API token (add to apps/bot/.env.dev as WEB_APP_API_TOKEN):"
echo "  $API_TOKEN"
echo ""
echo "Next: run ./deploy-dev.sh"
