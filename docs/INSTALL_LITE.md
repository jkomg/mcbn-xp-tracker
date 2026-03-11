# Install Guide (Lite): Web App Only

Use this guide if you only want the web interface and do **not** want to run the Discord bot.

Reference: [ENV_AND_SECRETS.md](ENV_AND_SECRETS.md)

## Outcome

- Web app running at `http://127.0.0.1:5001` locally.
- Same Google Sheet-backed workflow as production.

## Fast Path (One Command, Docker)

After completing env and credential setup in this guide, start web-only profile with:

```bash
./scripts/bootstrap-local.sh web-only
```

Stop it with:

```bash
./scripts/bootstrap-local.sh web-only down
```

## 1) Prerequisites

- macOS/Linux shell
- Python `3.12+`
- Google service-account JSON with Sheets access
- Discord OAuth app (for web login)

## 2) Clone and Enter Repo

```bash
git clone https://github.com/jkomg/mcbn-xp-tracker.git
cd mcbn-xp-tracker
```

## 3) Create Python Environment

```bash
python3 -m venv apps/web/venv
source apps/web/venv/bin/activate
pip install -r apps/web/requirements.txt
```

## 4) Configure Web Environment

```bash
cp apps/web/.env.example apps/web/.env
```

Edit `apps/web/.env` and set:

```env
FLASK_SECRET_KEY=replace-with-random-string
FLASK_DEBUG=true

GOOGLE_CREDENTIALS_FILE=credentials/service-account.json
SPREADSHEET_ID=your-google-sheet-id

DISCORD_CLIENT_ID=your-discord-app-client-id
DISCORD_CLIENT_SECRET=your-discord-app-client-secret
DISCORD_REDIRECT_URI=http://127.0.0.1:5001/auth/callback
ALLOWED_DISCORD_IDS=discord-user-id-1,discord-user-id-2
```

## 5) Add Google Credentials File

Create directory and place your key:

```bash
mkdir -p apps/web/credentials
# copy your JSON to:
# apps/web/credentials/service-account.json
```

## 6) Initialize Sheet Tabs (Safe to Re-Run)

```bash
cd apps/web
python3 -c "from app import create_app; app = create_app(); from app import sheets_client; sheets_client.setup_sheets()"
cd ../..
```

## 7) Start Local Web App

Host Python venv:

```bash
./dev.sh
```

Docker option:

```bash
./scripts/bootstrap-local.sh web-only
```

Open: `http://127.0.0.1:5001`

## 8) Verify

- Login via Discord works.
- Player page loads.
- Staff page loads for IDs listed in `ALLOWED_DISCORD_IDS`.

## Troubleshooting

- `Invalid OAuth2 redirect_uri`:
  - Ensure Discord app redirect URI exactly matches `DISCORD_REDIRECT_URI`.
- Port conflict:
  - This project uses `5001` intentionally.
- `service-account.json` missing:
  - Verify path is `apps/web/credentials/service-account.json`.
