#!/usr/bin/env bash
# update-staff-access.sh
# Reads ALLOWED_DISCORD_IDS from .env and pushes to GCP Secret Manager,
# then updates the Cloud Run service to pick up the new version.
#
# Usage: ./update-staff-access.sh

set -euo pipefail

GCLOUD="/opt/homebrew/share/google-cloud-sdk/bin/gcloud"
PROJECT="mcbn-xp-tracker"
SECRET_NAME="mcbn-discord-allowed-ids"
SERVICE_NAME="mcbn-xp-tracker"
REGION="us-central1"

# Read ALLOWED_DISCORD_IDS from .env
IDS=$(grep '^ALLOWED_DISCORD_IDS=' .env | cut -d'=' -f2-)

if [ -z "$IDS" ]; then
    echo "❌ Could not find ALLOWED_DISCORD_IDS in .env"
    exit 1
fi

echo "📋 Discord IDs from .env:"
echo "   $IDS"
echo ""

# Push to GCP Secret Manager
echo "🔐 Updating GCP secret '$SECRET_NAME'..."
echo "$IDS" | $GCLOUD secrets versions add "$SECRET_NAME" \
    --data-file=- \
    --project="$PROJECT"

echo ""

# Update Cloud Run to pick up the new secret version
echo "🚀 Updating Cloud Run service '$SERVICE_NAME'..."
$GCLOUD run services update "$SERVICE_NAME" \
    --region="$REGION" \
    --project="$PROJECT" \
    --update-secrets="ALLOWED_DISCORD_IDS=${SECRET_NAME}:latest"

echo ""
echo "✅ Staff access updated and deployed!"
