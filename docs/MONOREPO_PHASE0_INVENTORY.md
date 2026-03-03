# Monorepo Phase 0 Inventory (Executed)

Generated: 2026-03-03

This inventory captures the current integration boundary between:

- Web app repo: `mcbn-xp-tracker` (Flask)
- Bot repo: `mcbn-tracker-bot` (Node/TypeScript)

## 1) Bot <-> Web API Contract Map

All bot-facing endpoints live under `/api/*` in the web app and are token-protected except `/api/health`.

Auth model:

- Header: `Authorization: Bearer <WEB_APP_API_TOKEN>`
- Validation: constant-time token comparison on web side

Endpoints:

1. `GET /api/health`
- Auth: none
- Purpose: liveness ping
- Response: `{ "ok": true }`
- Used by bot: adapter health check

2. `GET /api/meta/claim-context`
- Auth: required
- Rate limit: `60 per minute`
- Response:
  - `activeCharacters: string[]`
  - `openPeriods: string[]`
  - `currentNight: string | null`
- Used by bot: `/xp submit` and context-driven command UX

3. `GET /api/characters/{name}/summary`
- Auth: required
- Rate limit: `60 per minute`
- Response:
  - `characterName: string`
  - `earnedXp: number`
  - `totalXp: number`
  - `totalSpends: number`
  - `availableXp: number`
- Used by bot: `/xp summary`

4. `POST /api/claims`
- Auth: required
- Rate limit: `20 per minute`
- Request body:
  - `characterName: string`
  - `playPeriod: string`
  - `categories: Record<string, string>`
- Response success: `201 { ok: true, message: "Claim submitted" }`

5. `POST /api/spends`
- Auth: required
- Rate limit: `20 per minute`
- Request body:
  - `characterName: string`
  - `spendCategory: string`
  - `traitName: string`
  - `currentDots: number`
  - `newDots: number`
  - `isInClan: boolean`
  - `justification: string`
- Response success: `201 { ok: true, message: "Spend request submitted", xpCost: number }`

Source of truth files:

- Web API implementation: `app/blueprints/api.py`
- Bot adapter client: `/Users/jasonkennedy/Projects/mcbn-tracker-bot/src/services/adapter.ts`
- Bot payload/shape types: `/Users/jasonkennedy/Projects/mcbn-tracker-bot/src/types.ts`

## 2) Environment Variable Matrix

### Web app (`mcbn-xp-tracker`)

Local `.env` / dev runtime:

- `FLASK_SECRET_KEY`
- `FLASK_DEBUG`
- `SESSION_COOKIE_SECURE`
- `SESSION_COOKIE_SAMESITE`
- `SESSION_LIFETIME_SECONDS`
- `GOOGLE_CREDENTIALS_FILE`
- `SPREADSHEET_ID`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `ALLOWED_DISCORD_IDS`
- `WEB_APP_API_TOKEN`
- optional: `DISCORD_WEBHOOK_URL`

Prod (Cloud Run):

- Plain env vars set by deploy script:
  - `FLASK_DEBUG=false`
  - `SPREADSHEET_ID`
  - `SHEETS_CACHE_TTL`
  - `DISCORD_REDIRECT_URI=https://mcbn.jkomg.us/auth/callback`
- Secret Manager-backed envs:
  - `FLASK_SECRET_KEY`
  - `GOOGLE_CREDENTIALS_JSON`
  - `DISCORD_CLIENT_ID`
  - `DISCORD_CLIENT_SECRET`
  - `ALLOWED_DISCORD_IDS`
  - `WEB_APP_API_TOKEN`

### Bot (`mcbn-tracker-bot`)

Required:

- `BOT_TOKEN`
- `CLIENT_ID` (required for command registration path)

Optional/common:

- `TEST_GUILD_ID`
- `WEB_APP_BASE_URL` (default `http://127.0.0.1:5001`)
- `WEB_APP_API_TOKEN`
- `REQUEST_TIMEOUT_MS`
- `CLAIM_CONTEXT_CACHE_TTL_MS`
- `CLAIM_CONTEXT_STALE_IF_ERROR_MS`
- `CLAIM_CONTEXT_MAX_RETRIES`
- `CLAIM_CONTEXT_RETRY_BASE_MS`

Validation notes:

- Bot enforces HTTPS for non-localhost `WEB_APP_BASE_URL`.
- Web rejects missing/invalid bot bearer token for protected API routes.

## 3) Current Release Checklist (Baseline)

Use this checklist prior to monorepo migration and for each cross-repo release.

1. Web app quality gate
- Run in `mcbn-xp-tracker`:
  - `./venv/bin/pytest -q`
  - `./venv/bin/ruff check app tests`

2. Bot quality gate
- Run in `mcbn-tracker-bot`:
  - `npm ci`
  - `npm run check`

3. Contract compatibility smoke test
- Bot health command succeeds (`/xp health`)
- Bot summary command succeeds (`/xp summary`)
- Bot claim submission succeeds
- Bot spend submission succeeds

4. Token/config alignment
- Confirm `WEB_APP_API_TOKEN` matches between bot env and web prod secret
- Confirm `WEB_APP_BASE_URL` points to active web environment
- Confirm Discord redirect URIs are correct for env (dev vs prod)

5. Deployment
- Web: deploy via `./deploy.sh` in web repo
- Bot local host: `git pull && npm ci && npm run build && restart service`

6. Post-deploy validation
- Web endpoint responds: `https://mcbn.jkomg.us`
- Bot is online and command latency acceptable
- Audit log entries appear for bot claim/spend submissions

## 4) Key integration risks captured in Phase 0

- Contract drift risk between bot adapter and web API payloads.
- Env drift risk for `WEB_APP_API_TOKEN` and `WEB_APP_BASE_URL`.
- Divergent release cadence between repos.

These are the primary targets for Phase 2 (shared contracts) and Phase 3 (path-aware monorepo CI).
