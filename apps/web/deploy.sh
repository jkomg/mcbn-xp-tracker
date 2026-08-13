#!/bin/bash
# MCbN XP Tracker — Cloud Run deploy trigger.
#
# This script no longer builds or deploys anything itself. It triggers the
# GitHub Actions workflow that does, via workflow_dispatch.
#
# WHY: this script used to carry its own full `gcloud run deploy` invocation
# targeting the same live service as .github/workflows/deploy-web.yml. Two
# independent definitions of one service drift, and `--set-env-vars` REMOVES
# any env var it does not list — so a manual run could silently revert config
# set by CI. That happened: prod was bumped to 512Mi in a9c44f4 and this
# script kept saying 256Mi. The workflows are now the single source of truth
# for image build, resource flags, env vars, and secret bindings.
#
# Normal deploys are automatic and need no action here:
#   - dev  (mcbn-xp-tracker-dev)  — every push that passes CI, on any branch
#   - prod (mcbn-xp-tracker)      — after a dev deploy succeeds on main
#
# Use this only to force a redeploy without a new commit (e.g. after rotating
# a secret in Secret Manager, since Cloud Run pins :latest at deploy time).
#
# Usage:
#   ./deploy.sh            # redeploy prod from main
#   ./deploy.sh dev        # redeploy dev from the current branch
#
# ============================================================
# ONE-TIME GCP SETUP (only needed when bootstrapping a new project):
# ============================================================
#
# 1. Install Google Cloud CLI:
#      brew install google-cloud-sdk
#
# 2. Log in and create/select a project:
#      gcloud auth login
#      gcloud projects create mcbn-xp-tracker --name="MCbN XP Tracker"
#      gcloud config set project mcbn-xp-tracker
#
# 3. Enable required APIs (free):
#      gcloud services enable run.googleapis.com
#      gcloud services enable artifactregistry.googleapis.com
#
# 4. Create Artifact Registry repo (stores Docker images, free tier):
#      gcloud artifacts repositories create mcbn-repo \
#        --repository-format=docker \
#        --location=us-central1
#
# 5. Populate Secret Manager:
#      ./setup-secrets.sh
# ============================================================

set -euo pipefail

TARGET="${1:-prod}"

case "${TARGET}" in
  prod)
    WORKFLOW="deploy-web.yml"
    SERVICE="mcbn-xp-tracker"
    SITE="https://mcbn.jkomg.us"
    REF="main"
    ;;
  dev)
    WORKFLOW="deploy-web-dev.yml"
    SERVICE="mcbn-xp-tracker-dev"
    SITE="https://dev.mcbn.jkomg.us"
    # --ref must name a branch or tag; on a detached HEAD this returns the
    # literal string "HEAD", which gh cannot resolve. Fail with something
    # actionable rather than letting the dispatch error out opaquely.
    REF="$(git rev-parse --abbrev-ref HEAD)"
    if [ "${REF}" = "HEAD" ]; then
      echo "ERROR: detached HEAD — cannot infer a branch to deploy." >&2
      echo "Check out a branch, or dispatch explicitly:" >&2
      echo "  gh workflow run ${WORKFLOW} --ref <branch-or-tag>" >&2
      exit 1
    fi
    ;;
  -h|--help|help)
    sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *)
    echo "ERROR: unknown target '${TARGET}' (expected 'prod' or 'dev')." >&2
    exit 1
    ;;
esac

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: the GitHub CLI (gh) is required to trigger a deploy." >&2
  echo "  brew install gh && gh auth login" >&2
  echo "Alternatively, trigger '${WORKFLOW}' by hand from the Actions tab." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh is not authenticated. Run: gh auth login" >&2
  exit 1
fi

echo "==> Target:   ${TARGET} (${SERVICE})"
echo "==> Site:     ${SITE}"
echo "==> Workflow: ${WORKFLOW} @ ${REF}"
echo

if [ "${TARGET}" = "prod" ]; then
  echo "This redeploys PRODUCTION from '${REF}'."
  echo "Normal releases happen automatically on merge to main — you only need"
  echo "this to force a redeploy without a new commit (e.g. after a secret"
  echo "rotation)."
  read -r -p "Continue? [y/N] " reply
  case "${reply}" in
    [yY]|[yY][eE][sS]) ;;
    *) echo "Aborted."; exit 1 ;;
  esac
fi

echo "==> Triggering ${WORKFLOW}..."
gh workflow run "${WORKFLOW}" --ref "${REF}"

echo
echo "==> Triggered. Watch it with:"
echo "      gh run watch"
echo "      gh run list --workflow=${WORKFLOW} --limit 5"
echo
echo "When it completes, verify at: ${SITE}/api/health"
