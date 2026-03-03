# Release 2026-03-03: Monorepo Migration Completion

## Summary

This release finalizes monorepo migration and local bot-hosting readiness.

- Canonical workspace path standardized to `/Users/jasonkennedy/Projects/mcbn-xp-tracker`.
- Bot runtime validated in `apps/bot` with clean startup and command registration.
- Go-live operational checklist added for release and rollback control.

## Validation Performed

- Bot full sanity gate (`apps/bot`):
  - `npm run lint`
  - `npm run format:check`
  - `npm run typecheck`
  - `npm run test`
  - `npm run build`
- Web/backend sanity gate:
  - `./venv/bin/pytest -q` (12 passing tests)
- Bot runtime startup check:
  - `npm run dev` logs `bot_ready`
  - Guild command registration successful for configured test guild

## Configuration Notes

- `CLIENT_ID` in `apps/bot/.env` must be the numeric Discord application snowflake.
- Bot env lives at `apps/bot/.env`.
- Root `.env` should not be used for bot runtime.

## Cost and Hosting Notes

- Bot remains locally hosted to avoid additional Cloud Run/Cloud SQL spend.
- Web app remains on Cloud Run with scale-to-zero settings.
- No managed database additions are required for this migration.

## Follow-Up

- Publish GitHub Release using this note plus changelog highlights.
- Execute `docs/GO_LIVE_CHECKLIST.md` before production promotion.
