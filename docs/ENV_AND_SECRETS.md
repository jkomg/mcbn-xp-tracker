# Environment and Secrets Flow

This project uses separate local env files per app and a managed secret path for Cloud Run.

## Local (Docker or host)

### Web (`apps/web`)

- Env file: `apps/web/.env`
- Template: `apps/web/.env.example`
- Google credentials file (local only): `apps/web/credentials/service-account.json`

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
