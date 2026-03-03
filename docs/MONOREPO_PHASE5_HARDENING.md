# Monorepo Phase 5 Hardening (Executed)

Generated: 2026-03-03

Phase 5 objective: strengthen bot API security controls and enforce release hygiene for shared contracts.

## Implemented controls

1. Scoped bot API tokens (web API)
- New optional config/env:
  - `WEB_APP_API_READ_TOKEN`
  - `WEB_APP_API_WRITE_TOKEN`
- Existing `WEB_APP_API_TOKEN` remains supported as a legacy token with both scopes.
- `write` token implies `read` scope.
- Endpoint scope mapping:
  - Read scope: `GET /api/meta/claim-context`, `GET /api/characters/{name}/summary`
  - Write scope: `POST /api/claims`, `POST /api/spends`

2. Replay protection for write routes (web API)
- New optional config/env:
  - `BOT_API_REPLAY_PROTECTION_ENABLED` (default: `false`)
  - `BOT_API_REPLAY_WINDOW_SECONDS` (default: `300`)
  - `BOT_API_NONCE_TTL_SECONDS` (default: `600`)
  - `BOT_API_NONCE_CACHE_SIZE` (default: `10000`)
- When enabled, write routes require headers:
  - `X-Request-Timestamp`
  - `X-Request-Nonce`
- Duplicate nonce returns `409` (replay detected).

3. Bot adapter write request hardening
- Bot now sends replay headers on every POST to `/api/claims` and `/api/spends`.

4. Shared-contract release hygiene
- PR template now includes a dedicated checklist for changes under:
  - `packages/api-contract`
  - `packages/rules`

## Files changed

- Web config: `apps/web/config.py`
- Web API auth/replay logic: `apps/web/app/blueprints/api.py`
- Web auth tests: `apps/web/tests/test_api_auth.py`
- Web env example: `apps/web/.env.example`
- Bot adapter headers: `apps/bot/src/services/adapter.ts`
- PR template checklist: `.github/pull_request_template.md`

## Validation outcomes

- Web lint and tests pass.
- Bot full checks pass.
- Replay and scope tests added to web API auth test suite.

## Rollout notes

- Safe default: replay protection is off until explicitly enabled.
- To enable full write replay protection in production:
  1. Set `BOT_API_REPLAY_PROTECTION_ENABLED=true`
  2. Deploy web and bot updates together
  3. Verify bot commands `/xp health`, `/xp claim`, `/xp spend`
