# MCbN XP Tracker

XP tracking and management for **Music City by Night** (MCbN), a Vampire: the Masquerade V5 chronicle based in Nashville, TN. The system handles XP earning and spending workflows for player characters — claims are submitted via Discord bot or web portal, reviewed by staff through an admin dashboard, and persisted in a **Turso/SQLite database** (the authoritative store). Google Sheets can be configured as an optional background mirror.

**Live:** [mcbn.jkomg.us](https://mcbn.jkomg.us) | **Dev:** `http://127.0.0.1:5001`

---

## Repo Structure

```
mcbn-xp-tracker/
  apps/
    web/          # Flask app (Python 3.12) — admin UI + REST API, Cloud Run deploy target
    bot/          # Discord bot (Node 20/TypeScript) — locally hosted on Ursula
    character-app/# React character-creator SPA, built into the web image at deploy time
  packages/
    api-contract/ # Shared request/response schemas and enums
    rules/        # Shared XP/spend formulas and fixtures
  infra/
    ursula/       # Bot host: agents, dashboard, failover (Cloud Run config lives in CI)
    bot-hosting/  # systemd / launchd unit templates for the bot
    web-hosting/  # launchd template for a local dev web instance
  docs/           # Runbooks, architecture, API reference
  scripts/        # Local bootstrap and ops scripts
  compose.web.yml   # Docker profile: web only
  compose.full.yml  # Docker profile: web + bot
```

## Quick Start (Docker)

```bash
# Web only (admin UI at http://127.0.0.1:5001)
./scripts/bootstrap-local.sh web-only

# Web + bot (full stack)
./scripts/bootstrap-local.sh web+bot

# Other actions
./scripts/bootstrap-local.sh web-only logs
./scripts/bootstrap-local.sh web+bot down
./scripts/bootstrap-local.sh web+bot ps
```

Container names: `mcbn-xp-tracker-web`, `lasombra-bot`.

Non-Docker alternative: `cd apps/web && python -m flask run --port 5001` / `cd apps/bot && npm start`.

## Production Deploy

Deploys are automatic via GitHub Actions — dev on any CI-passing push, prod
after a dev deploy succeeds on `main`. The commands below are only for forcing
a redeploy without a new commit (e.g. after rotating a secret):

```bash
cd apps/web && ./setup-secrets.sh    # sync env values to GCP Secret Manager
cd apps/web && ./deploy.sh           # trigger the prod deploy workflow (needs gh CLI)
cd apps/web && ./deploy.sh dev       # trigger the dev deploy workflow
```

The current production web app runs on Cloud Run as `mcbn-xp-tracker` and the dev web
app runs as the separate `mcbn-xp-tracker-dev` service. Each uses its own Turso
database and credentials. The Discord bot runs in Docker on Ursula, with a
heartbeat-triggered failover bot on little-mac. Kubernetes manifests under
`apps/*/k8s/` are retained for a future local-cluster migration and are not used by
the current deployment.

## Key Docs

| Doc | Purpose |
|-----|---------|
| [docs/WEB_APP.md](docs/WEB_APP.md) | Web app overview, admin UI screens, staff workflows |
| [docs/BOT.md](docs/BOT.md) | Bot slash commands, background services, Docker ops |
| [docs/API_ENDPOINTS.md](docs/API_ENDPOINTS.md) | Bot-facing REST API reference |
| [docs/ENV_AND_SECRETS.md](docs/ENV_AND_SECRETS.md) | All env vars, secrets flow, Docker notes |
| [docs/PRODUCTION_ENV_PROFILE.md](docs/PRODUCTION_ENV_PROFILE.md) | Production-safe env baseline and rollout sequence |
| [docs/CODEBASE_AUDIT_2026-04-09.md](docs/CODEBASE_AUDIT_2026-04-09.md) | Current cross-app audit snapshot + cost/functionality/doc-parity updates |
| [docs/RUN_WEB_DOCKER.md](docs/RUN_WEB_DOCKER.md) | Web Docker runbook |
| [docs/RUN_BOT_DOCKER.md](docs/RUN_BOT_DOCKER.md) | Bot Docker runbook and audit log ops |
| [docs/INSTALL_LITE.md](docs/INSTALL_LITE.md) | Install guide: web only |
| [docs/INSTALL_REGULAR.md](docs/INSTALL_REGULAR.md) | Install guide: web + bot |
| [CLAUDE.md](CLAUDE.md) | Contributor and developer orientation |

## Open Source

License: [MIT](LICENSE) | Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) | Security: [SECURITY.md](SECURITY.md)
