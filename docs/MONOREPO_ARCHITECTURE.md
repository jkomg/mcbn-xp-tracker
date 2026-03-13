# Monorepo Architecture Blueprint (Web + Bot)

## Goal

Run the Discord bot as an additional front end to the same XP workflow while preserving the web app as the system of record.

## Recommended target

Use a monorepo with two deployables and shared contracts:

```text
mcbn/
  apps/
    web/                      # Flask app (Cloud Run)
    bot/                      # Discord bot (Node/TS, local host)
  packages/
    api-contract/             # Shared request/response schemas + enums
    rules/                    # Shared XP/spend formulas + fixtures
  infra/
    cloudrun/                 # Deploy scripts, service config, release notes
  docs/
    MONOREPO_ARCHITECTURE.md
    MONOREPO_MIGRATION_PLAN.md
    RUN_BOT_LOCAL.md
```

## System boundaries

- `apps/web` is the authority for validation, approvals, and persistence (Turso/libsql database).
- Google Sheets is a best-effort background mirror — written after every DB commit, never read as primary source.
- `apps/bot` calls web API endpoints with a service token. Bot does not write to the database or Sheets directly.
- Shared packages prevent category/rule drift between clients.

## API ownership model

- Keep one backend API contract.
- Add contract tests that run bot payloads against web validation.
- Version contract changes (`v1`, `v1.1`) with changelog entries.

## Runtime model

### Recommended (cost-safe)

- Web app: Cloud Run (scale to zero)
- Bot: local always-on process (launchd/systemd)

Why:

- Discord bot uses persistent gateway connection.
- Local hosting avoids always-on cloud instance costs.
- Keeps current free-tier posture for web path.

### Optional (cloud bot)

- A Cloud Run bot requires always-on behavior to keep gateway alive.
- This can move you away from cost-flat operation.
- Only consider if local hosting is operationally unacceptable.

## Security model

- Keep bot token only in bot host env/secrets.
- Keep web API token scoped and rotated.
- Restrict API token permissions to bot-required endpoints.
- Continue staff authorization in web app using Discord IDs.

## Observability

- Add `request_id`/`correlation_id` from bot command to web API logs.
- Keep separate logs for bot runtime and web runtime.
- Add an `/api/meta/health` check the bot can call on startup.

## Non-goals for phase 1

- ~~No replacement of Google Sheets persistence.~~ *(completed — Turso/libsql is now primary)*
- ~~No migration to a new database.~~ *(completed — Sheets data migrated to Turso)*
- No unified single runtime process for both app + bot.
