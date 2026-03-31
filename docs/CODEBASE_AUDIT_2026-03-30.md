# Codebase Audit Snapshot (2026-03-30)

Scope: `apps/web` + `apps/bot` + top-level docs/runbooks.

## 1) What the System Does Today

- Web app (`apps/web`, Flask) is the system of record for characters, periods, claims, spends, ledger, and settings.
- Bot (`apps/bot`, Discord.js/TS) is a Discord front-end and scheduler that calls web `/api/*` endpoints.
- Data authority is DB-first (Turso in prod, SQLite local), with Google Sheets as best-effort backup mirror.
- Player UX exists in both Discord (`/xp ...`) and web player portal (`/player`), with staff review and controls in the web dashboard.

## 2) Surface Area Confirmed from Code

### Web API routes (`apps/web/app/blueprints/api.py`)
- Health: `/api/health`
- Meta: `/api/meta/claim-context`, `/api/meta/claim-reminder-targets`, `/api/meta/active-roster`
- Character: `/api/characters/<name>/summary`
- Event feeds: `/api/submission-events`, `/api/review-events`
- Bot ops: `/api/bot-config`, `/api/bot-heartbeat` (GET/POST)
- Period automation: `/api/periods/auto-create`, `/api/periods/auto-close`
- Writes: `/api/claims`, `/api/spends`

### Bot runtime (`apps/bot/src/index.ts`)
- Commands: `/ping`, `/xp ...`, `/combat`
- Services: review notifier, submission notifier, claim reminders, period auto-create/close triggers, passage-of-time scheduler, hunt consequence monitor, config sync worker, heartbeat sender, cubby monitor.

## 3) Documentation Updates Applied in This Pass

- Normalized claim-reminder scheduling docs where defaults were previously inconsistent:
  - `docs/BOT.md`: now states template default (Sunday 12:00 local) and code fallback (08:00) explicitly.
  - `docs/ENV_AND_SECRETS.md`: `CLAIM_REMINDER_HOUR_LOCAL` now documents both template and code fallback defaults.

## 4) Findings and Improvement Pointers

### Security (highest priority)

1. Keep replay protection enabled in production.
- `BOT_API_REPLAY_PROTECTION_ENABLED` is optional and defaults off; turn it on for all production bot write routes.

2. Use scoped bot tokens and rotate away from legacy token usage.
- Prefer `WEB_APP_API_READ_TOKEN` + `WEB_APP_API_WRITE_TOKEN`.
- Keep `WEB_APP_API_TOKEN` unset after migration to scoped tokens.

3. Harden session/key posture in production.
- Ensure non-default `FLASK_SECRET_KEY`.
- Enforce HTTPS redirect URI and `SESSION_COOKIE_SECURE=true` in production.

### Efficiency and Cost

1. Reduce periodic poll load where immediacy is not critical.
- Services polling every 60s are fine at current scale, but moving some checks (for example submission/review events) to 120–180s reduces idle API traffic and Cloud Run wakeups.

2. Add lightweight DB indexes for time-based poll paths.
- Event feeds filter/sort on string timestamps and statuses; adding indexes on `review_date`, `timestamp`, and `(status, review_date|timestamp)` for claims/spends can reduce scan cost as history grows.

3. Keep Cloud Run min instances at zero unless latency SLO requires otherwise.
- Current architecture remains cost-efficient with local bot + scale-to-zero web.

### UX and Operations

1. Converge one canonical “recommended defaults” table.
- Keep one source of truth for scheduler defaults and link all install/run docs to it to avoid drift.

2. Add a short “production profile” env example.
- Separate “dev convenience” vs “production-safe” defaults (cookies, debug, replay protection, token scope) in a dedicated doc or `.env.production.example`.

3. Expand runbook checks for bot-service behavior.
- Add explicit checks for config sync (`/api/bot-config`) and heartbeat age thresholds in go-live checklist.

## 5) Suggested Next Hardening Batch

1. Add DB indexes for claim/spend event polling.
2. Flip production replay protection to required + verify nonce window settings.
3. Move all production bot auth to scoped tokens only.
4. Add a production env template and wire checklist to it.

## 6) Implementation Status (This Branch)

- Implemented: bot adapter now supports scoped read/write tokens with legacy fallback.
- Implemented: review/submission notifier default polling intervals raised to 120s for lower idle load.
- Implemented: DB indexes added for event-feed polling patterns (`xp_claims` and `spend_requests` status+timestamp/review_date).
- Implemented: production env templates added for web and bot.
- Implemented: deploy/secret-sync scripts updated for scoped token secrets and production replay-protection defaults.
- Implemented: go-live checklist expanded with replay protection, scoped token, bot-config, and heartbeat checks.
