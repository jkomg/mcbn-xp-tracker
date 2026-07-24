#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

assert_contains() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if ! grep -Fq "${pattern}" "${file}"; then
    echo "Docs parity check failed: ${label} not found in ${file}"
    exit 1
  fi
}

assert_contains "README.md" "./scripts/bootstrap-local.sh web-only" "web-only one-command profile"
assert_contains "README.md" "./scripts/bootstrap-local.sh web+bot" "web+bot one-command profile"
assert_contains "README.md" "compose.web.yml" "top-level web compose reference"
assert_contains "README.md" "compose.full.yml" "top-level full compose reference"
assert_contains "README.md" "docs/ENV_AND_SECRETS.md" "env/secrets runbook reference"
assert_contains "docs/INSTALL_LITE.md" "./scripts/bootstrap-local.sh web-only" "lite install one-command bootstrap"
assert_contains "docs/INSTALL_REGULAR.md" "./scripts/bootstrap-local.sh web+bot" "regular install one-command bootstrap"

# Command semantics parity (portal-first claim/spend flow)
assert_contains "docs/BOT.md" '| `/xp submit` | Players | Redirect to the web player portal claim flow |' "xp submit portal semantics"
assert_contains "docs/BOT.md" '| `/xp claim` | Players | Redirect to the web player portal claim flow |' "xp claim portal semantics"
assert_contains "docs/BOT.md" '| `/xp spend` | Players | Redirect to the web player portal spend flow |' "xp spend portal semantics"

# Current runtime/deployment references
assert_contains "apps/bot/k8s/deployment.yaml" "http://mcbn-web:8091" "Kubernetes bot Service port"
assert_contains "apps/web/k8s/deployment.yaml" "port: 8091" "Kubernetes web Service port"
assert_contains "docs/ENV_AND_SECRETS.md" "CC_SUBMISSION_NOTIFIER_ENABLED" "character submission notifier env documentation"
assert_contains "docs/ENV_AND_SECRETS.md" "CC_APPROVAL_NOTIFIER_ENABLED" "character approval notifier env documentation"
assert_contains "docs/BOT.md" "manual Wiki sync requests" "current wiki sync terminology"
