#!/usr/bin/env bash
# Run a `gcloud run deploy` command, retrying when the new revision fails its
# startup probe.
#
# Usage: scripts/cloud-run-deploy-retry.sh gcloud run deploy <service> [flags...]
#
# A revision that can't reach Turso during startup migrations exits, and Cloud
# Run restarts it for about five minutes before giving up. On 2026-10-26 a
# Turso us-east-1 degradation outlasted that window and failed the dev deploy
# of #452. Retrying the deploy after a pause gives an outage up to ~15 minutes
# to clear. Only the startup-probe failure is retried: a bad flag, missing
# secret or permission error fails the same way every time, so it fails now.
#
# DEPLOY_ATTEMPTS (default 3) and DEPLOY_RETRY_SLEEP_SECONDS (default 120)
# override the defaults.
set -uo pipefail

attempts="${DEPLOY_ATTEMPTS:-3}"
pause="${DEPLOY_RETRY_SLEEP_SECONDS:-120}"
log="$(mktemp)"
trap 'rm -f "$log"' EXIT

for attempt in $(seq 1 "$attempts"); do
  echo "Deploy attempt $attempt of $attempts"
  if "$@" 2>&1 | tee "$log"; then
    exit 0
  fi
  if ! grep -q 'failed the configured startup probe' "$log"; then
    echo "Deploy failed for a reason other than the startup probe; not retrying."
    exit 1
  fi
  if [ "$attempt" -lt "$attempts" ]; then
    echo "::warning::Revision failed its startup probe (attempt $attempt of $attempts). Retrying in ${pause}s — often the database is briefly unreachable."
    sleep "$pause"
  fi
done

echo "::error::Revision failed its startup probe on all $attempts attempts. Check the revision logs; if Turso is degraded, re-run this workflow once it recovers."
exit 1
