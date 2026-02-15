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

# Flask secret key — generate a strong random one for production
FLASK_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
echo -n "${FLASK_SECRET}" | gcloud secrets create mcbn-flask-secret \
  --data-file=- --project="${PROJECT_ID}" 2>/dev/null || \
echo -n "${FLASK_SECRET}" | gcloud secrets versions add mcbn-flask-secret \
  --data-file=- --project="${PROJECT_ID}"
echo "  ✓ mcbn-flask-secret"

# Spreadsheet ID
echo -n "1nCBYmXyUcrY-RhqTlH46M3C3HCFDBIfJXaurfTk55w0" | gcloud secrets create mcbn-spreadsheet-id \
  --data-file=- --project="${PROJECT_ID}" 2>/dev/null || \
echo -n "1nCBYmXyUcrY-RhqTlH46M3C3HCFDBIfJXaurfTk55w0" | gcloud secrets versions add mcbn-spreadsheet-id \
  --data-file=- --project="${PROJECT_ID}"
echo "  ✓ mcbn-spreadsheet-id"

# Staff password
read -sp "Enter your staff password: " STAFF_PW
echo ""
echo -n "${STAFF_PW}" | gcloud secrets create mcbn-staff-password \
  --data-file=- --project="${PROJECT_ID}" 2>/dev/null || \
echo -n "${STAFF_PW}" | gcloud secrets versions add mcbn-staff-password \
  --data-file=- --project="${PROJECT_ID}"
echo "  ✓ mcbn-staff-password"

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

# Grant Cloud Run access to the secrets
echo ""
echo "==> Granting Cloud Run service account access to secrets..."
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
SA_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for SECRET in mcbn-flask-secret mcbn-spreadsheet-id mcbn-staff-password mcbn-google-creds; do
  gcloud secrets add-iam-policy-binding "${SECRET}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT_ID}" --quiet
done
echo "  ✓ All secrets accessible by Cloud Run"

echo ""
echo "=== Done! Now run: ./deploy.sh ==="
