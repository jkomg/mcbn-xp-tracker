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
