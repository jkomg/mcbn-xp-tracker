# Environment and Secrets Flow

This project uses separate local env files per app and a managed secret path for Cloud Run.

## Local (Docker or host)

### Web (`apps/web`)

- Env file: `apps/web/.env`
- Template: `apps/web/.env.example`
- Google credentials file (local only): `apps/web/credentials/service-account.json`

**Database:**
- Local dev: SQLite (default — no extra config needed). `DATABASE_URL=sqlite:///data/db.sqlite`
- Production (Cloud Run): Turso/libsql. Set `DATABASE_URL=libsql+https://your-db.turso.io` and `TURSO_AUTH_TOKEN=your-token`.
- Schema is created on first startup automatically.
- To sync existing Sheets data into the DB: `cd apps/web && python scripts/migrate_sheets_to_db.py`

**Google Sheets** remains active as a background mirror for backup. The `GOOGLE_CREDENTIALS_FILE` and `SPREADSHEET_ID` are still required in production.

### Bot (`apps/bot`)

- Env file: `apps/bot/.env`
- Template: `apps/bot/.env.example`

For local full-stack Docker (`compose.full.yml`), bot API base URL should resolve to the web service:
- `WEB_APP_BASE_URL=http://web:5001`

The bootstrap script handles this default for new setups:

```bash
./scripts/bootstrap-local.sh web+bot
```

## Optional GCP Secret Import Path (Web Production)

Cloud Run production secrets are managed via Secret Manager:

1. Configure web local env values in `apps/web/.env`.
2. Run:

```bash
cd apps/web
./setup-secrets.sh
```

This imports configured values into Secret Manager and updates Cloud Run env mappings.

## Deploy Path (Web Production)

```bash
cd apps/web
./deploy.sh
```

`deploy.sh` builds/pushes the web image and deploys a new Cloud Run revision.

## Rules

- Never commit `.env` files.
- Never commit service-account JSON keys.
- Commit only `*.example` templates.
