#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/apps/web"
exec ./setup-secrets.sh "$@"
