# Go-Live Checklist (Monorepo Migration)

Use this checklist when promoting the merged web + bot setup to production.

## 1) Repository and Branch Hygiene
- [ ] `main` is up to date with merged migration PRs.
- [ ] Branch protection is enabled on `main` with required status checks.
- [ ] No local-only files are pending (`.env*`, backup files, temp scripts).
- [ ] CI checks are green on the release commit.

## 2) Secrets and Environment
- [ ] Discord bot token is rotated and current.
- [ ] `apps/bot/.env` is present on the bot host (not in git).
- [ ] Bot env values are valid:
  - [ ] `BOT_TOKEN`
  - [ ] `CLIENT_ID` (numeric Discord application snowflake)
  - [ ] `TEST_GUILD_ID` (for controlled command registration)
  - [ ] `WEB_APP_BASE_URL` (prod URL, HTTPS)
  - [ ] `WEB_APP_API_TOKEN` (if protected bot->web endpoints are used)
- [ ] Web app prod secrets are set in GCP Secret Manager / Cloud Run env.

## 3) Web Application Production Validation
- [ ] Deploy latest release commit to Cloud Run.
- [ ] Confirm custom domain mapping is healthy (`mcbn.jkomg.us`).
- [ ] Confirm health endpoint:
  - [ ] `GET /api/health` returns OK
- [ ] Confirm adapter endpoint used by bot:
  - [ ] `GET /api/meta/claim-context` returns expected JSON (auth if required)
- [ ] Confirm OAuth redirect URI values exactly match production callback URL.

## 4) Bot Runtime Validation (Local Host / Pi / VM)
- [ ] Bot host uses Node 20+ LTS.
- [ ] Install deps and run checks:
  - [ ] `npm run check` in `apps/bot`
- [ ] Startup test:
  - [ ] `npm run dev` logs `bot_ready`
  - [ ] command registration succeeds for `TEST_GUILD_ID`
- [ ] Process supervisor configured (`systemd` or `pm2`) with auto-restart.
- [ ] Logs are persisted and rotated.

## 5) Functional Smoke Tests
- [ ] `/ping` works.
- [ ] `/xp health` reports web adapter as healthy.
- [ ] `/xp summary` returns expected character data.
- [ ] `/xp claim` submits successfully.
- [ ] `/xp spend` computes/creates requests using current XP rules.
- [ ] Web UI and bot show consistent XP totals after a test claim/spend.

## 6) Cost Guardrails (Free-Tier Focus)
- [ ] Bot remains locally hosted (not Cloud Run) unless intentionally changed.
- [ ] No Cloud SQL is provisioned for bot runtime.
- [ ] Cloud Run min instances remain `0` unless explicitly required.
- [ ] Monitoring/alerts are limited to free-tier friendly defaults.

## 7) Release and Rollback
- [ ] Publish release notes summarizing migration + XP rule changes.
- [ ] Tag the release commit.
- [ ] Document rollback target (previous stable commit/tag).
- [ ] Validate rollback procedure in advance (deploy + smoke test).
