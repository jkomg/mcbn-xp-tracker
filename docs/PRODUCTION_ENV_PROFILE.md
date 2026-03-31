# Production Environment Profile

Use these templates as secure, cost-conscious production baselines:

- Web: `apps/web/.env.production.example`
- Bot: `apps/bot/.env.production.example`

## Key Production Rules

1. Keep `FLASK_DEBUG=false`.
2. Keep `SESSION_COOKIE_SECURE=true`.
3. Use scoped bot API tokens (`WEB_APP_API_READ_TOKEN`, `WEB_APP_API_WRITE_TOKEN`) and retire legacy token usage.
4. Keep bot write-route replay protection enabled (`BOT_API_REPLAY_PROTECTION_ENABLED=true`).
5. Keep Cloud Run `min-instances=0` unless latency SLOs require warm instances.
6. Keep bot polling intervals at cost-conscious defaults unless faster notification latency is required.

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
