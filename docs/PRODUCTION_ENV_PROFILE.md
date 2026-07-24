# Production Environment Profile

Use these templates as secure, cost-conscious production baselines:

- Web: `apps/web/.env.production.example`
- Bot: `apps/bot/.env.production.example`

## Current Deployment Topology

- Production web: Cloud Run service `mcbn-xp-tracker`, custom domain `mcbn.jkomg.us`.
- Dev web: separate Cloud Run service `mcbn-xp-tracker-dev`, custom domain
  `dev.mcbn.jkomg.us`.
- Databases: separate production and dev Turso databases, injected through distinct
  Cloud Secret Manager secrets.
- Production bot: Docker on Ursula.
- Bot failover: heartbeat-triggered Docker/OrbStack bot on little-mac.
- Kubernetes: `apps/web/k8s/` and `apps/bot/k8s/` are migration-preparation manifests
  for a future local cluster. They are not the current production deployment.

## Key Production Rules

1. Keep `FLASK_DEBUG=false`.
2. Keep `SESSION_COOKIE_SECURE=true`.
3. Use scoped bot API tokens (`WEB_APP_API_READ_TOKEN`, `WEB_APP_API_WRITE_TOKEN`) and retire legacy token usage.
4. Keep bot write-route replay protection enabled (`BOT_API_REPLAY_PROTECTION_ENABLED=true`).
5. Keep Cloud Run `min-instances=0` unless latency SLOs require warm instances.
6. Keep Cloud Run deploy defaults pinned (`cpu=1`, `memory=256Mi`, `max-instances=2`, `concurrency=80`, `timeout=120`).
7. Keep bot polling intervals at cost-conscious defaults unless faster notification latency is required.
8. Keep character creator notification services explicitly enabled only when their Discord channels are configured; the code defaults are off to avoid accidental 60-second web polling.

## Token Scope Mapping

- Bot read operations: `/api/meta/*`, `/api/characters/*/summary`, `/api/*-events`, `/api/bot-config`, `/api/bot-heartbeat` (GET)
- Bot write operations: `/api/claims`, `/api/spends`, `/api/periods/auto-*`, `/api/bot-heartbeat` (POST)

## Rollout Sequence

1. Populate production env files from the templates.
2. Sync secrets (`apps/web/setup-secrets.sh`).
3. Deploy web (`apps/web/deploy.sh`).
4. Restart bot with new env.
5. Validate:
- `/xp health` succeeds
- `/api/bot-heartbeat` age remains healthy
- claims/spends submit successfully

## Cloud Run Lean Baseline (Verified 2026-04-18)

- Service: `mcbn-xp-tracker` (`us-central1`)
- `cpu=1`
- `memory=256Mi`
- `min-instances=0`
- `max-instances=2`
- `concurrency=80`
- `timeout=120s`
- `session-affinity=false`

## Bot Polling Baseline (Cost-Conscious)

- `CONFIG_SYNC_INTERVAL_MS=120000`
- `BOT_HEARTBEAT_INTERVAL_MS=120000`
- `REVIEW_NOTIFIER_INTERVAL_MS=120000`
- `SUBMISSION_NOTIFIER_INTERVAL_MS=120000`
- `CC_SUBMISSION_NOTIFIER_ENABLED=true` when character draft submission alerts are required
- `CC_APPROVAL_NOTIFIER_ENABLED=true` when character approval alerts are required
- `CC_SUBMISSION_NOTIFIER_INTERVAL_MS=120000`
- `CC_APPROVAL_NOTIFIER_INTERVAL_MS=120000`

Use shorter intervals only when operational latency requirements justify the extra request volume.

## Efficiency Drift Check

Run this after deploys and during monthly ops review:

```bash
./scripts/check-cloudrun-efficiency.sh
```
