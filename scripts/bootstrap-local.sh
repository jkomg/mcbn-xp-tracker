#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PROFILE="${1:-}"
ACTION="${2:-up}"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/bootstrap-local.sh web-only [up|down|logs|ps|config]
  ./scripts/bootstrap-local.sh web+bot  [up|down|logs|ps|config]

Examples:
  ./scripts/bootstrap-local.sh web-only
  ./scripts/bootstrap-local.sh web+bot
  ./scripts/bootstrap-local.sh web+bot logs
EOF
}

if [[ -z "${PROFILE}" ]]; then
  usage
  exit 1
fi

case "${PROFILE}" in
  web-only) COMPOSE_FILE="${ROOT_DIR}/compose.web.yml" ;;
  web+bot) COMPOSE_FILE="${ROOT_DIR}/compose.full.yml" ;;
  *)
    echo "Unknown profile: ${PROFILE}"
    usage
    exit 1
    ;;
esac

ensure_file() {
  local dst="$1"
  local src="$2"
  if [[ ! -f "${dst}" ]]; then
    cp "${src}" "${dst}"
    echo "Created ${dst} from ${src}"
  fi
}

ensure_file "${ROOT_DIR}/apps/web/.env" "${ROOT_DIR}/apps/web/.env.example"
if [[ "${PROFILE}" == "web+bot" ]]; then
  ensure_file "${ROOT_DIR}/apps/bot/.env" "${ROOT_DIR}/apps/bot/.env.example"
  perl -0pi -e 's/^WEB_APP_BASE_URL=http:\/\/127\.0\.0\.1:5001$/WEB_APP_BASE_URL=http:\/\/web:5001/m' \
    "${ROOT_DIR}/apps/bot/.env"
fi

if [[ ! -f "${ROOT_DIR}/apps/web/credentials/service-account.json" ]]; then
  echo "WARNING: apps/web/credentials/service-account.json is missing."
fi

cd "${ROOT_DIR}"

reconcile_named_container() {
  local name="$1"
  if docker ps -a --format '{{.Names}}' | grep -Fxq "${name}"; then
    docker rm -f "${name}" >/dev/null 2>&1 || true
  fi
}

case "${ACTION}" in
  up)
    reconcile_named_container "mcbn-xp-tracker-web"
    if [[ "${PROFILE}" == "web+bot" ]]; then
      reconcile_named_container "lasombra-bot"
    fi
    docker compose -f "${COMPOSE_FILE}" up -d --build
    docker compose -f "${COMPOSE_FILE}" ps
    ;;
  down)
    docker compose -f "${COMPOSE_FILE}" down
    ;;
  logs)
    docker compose -f "${COMPOSE_FILE}" logs -f --tail=200
    ;;
  ps)
    docker compose -f "${COMPOSE_FILE}" ps
    ;;
  config)
    docker compose -f "${COMPOSE_FILE}" config
    ;;
  *)
    echo "Unknown action: ${ACTION}"
    usage
    exit 1
    ;;
esac
