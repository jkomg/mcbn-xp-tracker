#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/apps/web"
exec ./update-staff-access.sh "$@"
