# MCbN XP Tracker

XP tracking and management for **Music City by Night**, a Vampire: The Masquerade V5 chronicle (Nashville, TN).

**Live:** [mcbn.jkomg.us](https://mcbn.jkomg.us) | **Dev:** `http://127.0.0.1:5001`

---

## Open Source

- License: [MIT](LICENSE)
- Contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Security reporting: [SECURITY.md](SECURITY.md)
- Support expectations: [SUPPORT.md](SUPPORT.md)
- Notices/disclosures: [NOTICE.md](NOTICE.md)
- Monorepo architecture draft: [docs/MONOREPO_ARCHITECTURE.md](docs/MONOREPO_ARCHITECTURE.md)
- Monorepo migration plan: [docs/MONOREPO_MIGRATION_PLAN.md](docs/MONOREPO_MIGRATION_PLAN.md)
- Monorepo phase 0 inventory: [docs/MONOREPO_PHASE0_INVENTORY.md](docs/MONOREPO_PHASE0_INVENTORY.md)
- Monorepo phase 4 operations: [docs/MONOREPO_PHASE4_OPERATIONS.md](docs/MONOREPO_PHASE4_OPERATIONS.md)
- Monorepo phase 5 hardening: [docs/MONOREPO_PHASE5_HARDENING.md](docs/MONOREPO_PHASE5_HARDENING.md)
- Go-live checklist: [docs/GO_LIVE_CHECKLIST.md](docs/GO_LIVE_CHECKLIST.md)
- Local bot hosting runbook: [docs/RUN_BOT_LOCAL.md](docs/RUN_BOT_LOCAL.md)
- Docker bot hosting runbook: [docs/RUN_BOT_DOCKER.md](docs/RUN_BOT_DOCKER.md)
- Docker web hosting runbook: [docs/RUN_WEB_DOCKER.md](docs/RUN_WEB_DOCKER.md)
- Environment + secrets flow: [docs/ENV_AND_SECRETS.md](docs/ENV_AND_SECRETS.md)
- Release note (2026-03-11): [docs/RELEASE_2026-03-11_CONTAINERIZATION_AND_FIXES.md](docs/RELEASE_2026-03-11_CONTAINERIZATION_AND_FIXES.md)
- Monorepo CI/CD blueprint: [docs/MONOREPO_CI_CD_BLUEPRINT.md](docs/MONOREPO_CI_CD_BLUEPRINT.md)
- Install guide (Lite, web-only): [docs/INSTALL_LITE.md](docs/INSTALL_LITE.md)
- Install guide (Regular, web + bot): [docs/INSTALL_REGULAR.md](docs/INSTALL_REGULAR.md)
- Player quickstart (web + bot): [docs/PLAYER_QUICKSTART.md](docs/PLAYER_QUICKSTART.md)

### Data and Privacy Disclosure

- This app stores character and gameplay metadata in a Google Sheet that the
  operators control.
- Discord OAuth identity (user ID/display name) is used for authentication and
  authorization.
- Do not commit production secrets or personal data to this repository.

---

## What It Does

Players visit `/player/`, pick their character, and submit XP claims and spend requests through the web app. Staff log in with Discord and review everything from a dashboard. Google Sheets is the database — every character, claim, spend, and audit entry lives there.

No spreadsheet formulas. The app handles all the math, validation, and workflow.

### Roles

| Role | Access | Does What |
|------|--------|-----------|
| **Players** | `/player/` (Discord OAuth login) | View own characters, claim XP, request spends |
| **Staff** | `/` (Discord OAuth login) | Review claims/spends, manage roster, adjust XP |
| **Owner** | Google Sheet + deploy scripts | Deployment, secrets, backend data |

All users authenticate via Discord OAuth. Staff are identified by their Discord ID in the `ALLOWED_DISCORD_IDS` list; everyone else is a player. Players can only see characters linked to their Discord account.

### XP Flow

```
Player submits claim or spend request
  -> Lands in Google Sheet as "Pending"
  -> Staff reviews in dashboard -> Approve / Deny
  -> Optional bot notifier posts approve/deny update to character cubby
  -> Optional bot-triggered auto-creation of the next night when due
  -> Optional bot sunrise reminders prompt players to submit XP claims
  -> XP totals update automatically
  -> Everything logged to Audit Trail
```

### XP Math

```
Total XP     = Creation XP + Approved Claims + Ledger Awards
Available XP = Total XP - Approved Spends - Ledger Spends
```

---

## Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Backend | Flask 3.1 (Python 3.12+) | Gunicorn in prod |
| Frontend | Bootstrap 5 | Custom dark VtM theme, mobile-responsive |
| Database | Google Sheets (6 tabs) | Free, no server needed |
| Auth | Discord OAuth2 | All users; staff vs player by Discord ID |
| Hosting | Google Cloud Run | Free tier, scales to zero |
| Secrets | GCP Secret Manager | All credentials stored securely in prod |

### Free Tier Design (Target)

The app is specifically designed to run within Google Cloud's free tier:

- **Cloud Run**: 2 million requests/month free. The app scales to **zero instances** when idle, so you only use resources when someone's on the site.
- **Artifact Registry**: Stores the Docker image. Free tier covers small projects.
- **Secret Manager**: 6 active secret versions free. Keep one enabled version per secret.
- **Google Sheets API**: 300 requests/minute free. The app caches reads for 30 seconds to stay well under this.

For this workload, operating costs are typically near zero when you stay within the
quotas above.

### CI and Automation Cost

- GitHub Actions CI (tests/lint on PR) does **not** add GCP cost.
- For public repositories, GitHub-hosted Actions are generally available at no charge.
- CI here runs in GitHub infrastructure, not Cloud Run.

### 2026-02 Security + Performance Update

This release adds CSRF protection, session/cookie hardening, API token comparison hardening, API rate limits, safer login redirects, and lower-chattiness Google Sheets write paths.

Expected GCP impact:

- **No new paid GCP products** were introduced.
- **Cloud Run resource settings are unchanged** (same CPU/memory/min/max instances).
- **Request volume is effectively unchanged** for normal use.
- **Google Sheets API usage is lower or unchanged** due to batching and append optimizations.

---

## Installation Paths (Choose One)

- **Lite (recommended to start):** web app only. Use [docs/INSTALL_LITE.md](docs/INSTALL_LITE.md).
- **Regular:** web app + local Discord bot. Use [docs/INSTALL_REGULAR.md](docs/INSTALL_REGULAR.md).

If you are unsure, start with Lite and add the bot later.

### Quickstart Matrix

| Install Profile | Runtime | One Command | Compose File |
|---|---|---|---|
| Web-only | Local Docker | `./scripts/bootstrap-local.sh web-only` | `compose.web.yml` |
| Web + Bot | Local Docker | `./scripts/bootstrap-local.sh web+bot` | `compose.full.yml` |
| Web-only | GCP Cloud Run | `cd apps/web && ./deploy.sh` | N/A |

For local host-venv workflows, keep using `./dev.sh` (web) and `cd apps/bot && npm run dev` (bot).

## Local Development

Phase 1 note: repository layout is now monorepo-style.

- Web app code is under `apps/web`.
- Bot code is under `apps/bot`.
- Root scripts (`./dev.sh`, `./deploy.sh`, etc.) are compatibility wrappers for web operations.

### Prerequisites

- Python 3.12+
- A Google Cloud service account with Sheets API access
- A Discord OAuth2 application

### First-Time Setup

```bash
# Clone and set up Python environment
git clone <repo-url> && cd mcbn-xp-tracker
python3 -m venv apps/web/venv
source apps/web/venv/bin/activate
pip install -r apps/web/requirements.txt

# Configure environment
cp apps/web/.env.example apps/web/.env
# Edit .env with your credentials (see below)

# Place your Google service account key
# Save the JSON file as: apps/web/credentials/service-account.json

# Initialize Google Sheet tabs (safe to re-run)
cd apps/web
python3 -c "from app import create_app; app = create_app(); from app import sheets_client; sheets_client.setup_sheets()"
```

### Upgrading from an older local Python venv

If your local `venv` was created with Python 3.9/3.10/3.11, recreate it with
Python 3.12+:

```bash
mv apps/web/venv apps/web/venv-old-backup
python3 -m venv apps/web/venv
source apps/web/venv/bin/activate
pip install -r apps/web/requirements.txt
```

### Running the Dev Server

Host Python venv:

```bash
./dev.sh
```

That's it. Opens at **http://127.0.0.1:5001** with debug mode and auto-reload. The script kills any existing process on port 5001 first, so it's safe to run repeatedly.

Docker option:

```bash
./scripts/bootstrap-local.sh web-only
```

Container logs:

```bash
./scripts/bootstrap-local.sh web-only logs
```

Stop:

```bash
./scripts/bootstrap-local.sh web-only down
```

Detailed runbook: [docs/RUN_WEB_DOCKER.md](docs/RUN_WEB_DOCKER.md)

> **Why port 5001?** macOS AirPlay Receiver squats on port 5000.

### Run Without an Open Terminal (macOS)

Use launchd helpers in this repo:

```bash
./scripts/macos-services.sh install all
./scripts/macos-services.sh status all
```

This starts local web (`us.mcbn.web-dev`) and bot (`us.mcbn.tracker-bot`) as background services and keeps them running after terminal windows close.

### Local Diagnostics Page

When `LOCAL_STATUS_ENABLED=true`, staff can view:
- launchd status for local web/bot services
- recent access log entries
- recent `web.*` and `bot.*` log tails

URL: `http://127.0.0.1:5001/local/status`

Security:
- route is staff-protected
- route only serves localhost requests

### `.env` Configuration

```env
FLASK_SECRET_KEY=any-random-string
FLASK_DEBUG=true

GOOGLE_CREDENTIALS_FILE=credentials/service-account.json
SPREADSHEET_ID=your-google-sheet-id

DISCORD_CLIENT_ID=your-discord-app-client-id
DISCORD_CLIENT_SECRET=your-discord-app-client-secret
DISCORD_REDIRECT_URI=http://127.0.0.1:5001/auth/callback
ALLOWED_DISCORD_IDS=discord-user-id-1,discord-user-id-2
```

### Discord OAuth2 Setup

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Create a new application
3. Under OAuth2, grab the **Client ID** and **Client Secret**
4. Add redirect URIs:
   - Dev: `http://127.0.0.1:5001/auth/callback`
   - Prod: `https://mcbn.jkomg.us/auth/callback`

### How Dev Works

Dev and prod share the **same Google Sheet**. Changes you make locally (approving claims, adding characters) show up on prod immediately. The only difference is:

- **Dev** reads credentials from `apps/web/.env` and `apps/web/credentials/service-account.json`
- **Prod** reads credentials from GCP Secret Manager

This means you can test the full app locally with real data.

---

## Production Deployment

### One-Time GCP Setup

```bash
# Install Google Cloud CLI
brew install google-cloud-sdk

# Authenticate
gcloud auth login
gcloud projects create mcbn-xp-tracker --name="MCbN XP Tracker"
gcloud config set project mcbn-xp-tracker

# Enable APIs
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com

# Create Docker image repo
gcloud artifacts repositories create mcbn-repo \
  --repository-format=docker \
  --location=us-central1

# Configure Docker auth
gcloud auth configure-docker us-central1-docker.pkg.dev

# Set up secrets (interactive — prompts for each value)
./setup-secrets.sh
```

### Deploying

```bash
# Required: set SPREADSHEET_ID in your shell or .env
# export SPREADSHEET_ID=your-google-sheet-id
./deploy.sh
```

Builds a Docker image, pushes to Artifact Registry, deploys to Cloud Run. Takes about 2-3 minutes. The app runs with 256MB RAM, scales 0-2 instances, and auto-sleeps when idle.

### Custom Domain (Squarespace + Cloud Run)

This project is served at `mcbn.jkomg.us` using Cloud Run custom domain mapping
and DNS hosted in Squarespace.

See the full runbook:

- [docs/CUSTOM_DOMAIN_SQUARESPACE.md](docs/CUSTOM_DOMAIN_SQUARESPACE.md)

### Updating Staff Access

When you need to add or remove staff Discord IDs:

1. Edit `ALLOWED_DISCORD_IDS` in `.env`
2. Run:
   ```bash
   ./update-staff-access.sh
   ```

This reads the IDs from your `.env`, pushes them to GCP Secret Manager, and updates Cloud Run in one step.

### Secret Manager Hygiene

To stay in free-tier range:

- Keep only one **enabled** version per secret.
- Remove unused secrets from Cloud Run env mappings.
- `SPREADSHEET_ID` is intentionally a plain env var (not a secret).

---

## Utility Scripts

| Script | What It Does |
|--------|-------------|
| `./scripts/bootstrap-local.sh web-only` | Bootstrap + run local web in Docker (`compose.web.yml`) |
| `./scripts/bootstrap-local.sh web+bot` | Bootstrap + run local web+bot in Docker (`compose.full.yml`) |
| `./dev.sh` | Start local dev server on port 5001 |
| `cd apps/web && docker compose up -d --build` | Start local web dev server in Docker on port 5001 |
| `./deploy.sh` | Build and deploy to Cloud Run |
| `./update-staff-access.sh` | Push Discord ID changes from `.env` to prod |
| `./setup-secrets.sh` | One-time GCP Secret Manager setup (interactive) |

---

## Responsible Disclosure

If you find a security issue, do not open a public issue. Follow
[SECURITY.md](SECURITY.md).

---

## Google Sheet Structure

The app uses a single Google Sheet with 6 tabs:

| Tab | What's In It |
|-----|-------------|
| **Roster** | Character list (name, clan, sect, age, creation XP, active status) |
| **Play Periods** | Night schedule and whether submissions are open |
| **XP Responses** | Player XP claims with category checkboxes, links, and staff review |
| **Spend Requests** | Player spend requests with cost validation and staff review |
| **XP Ledger** | Manual XP entries (imports, adjustments, historical data) |
| **Audit Log** | Every staff action with timestamp, who, what, and why |

The `setup_sheets()` function creates these tabs automatically if they don't exist.

---

## Player Guide

Quick version for Discord pin/reference: [docs/PLAYER_QUICKSTART.md](docs/PLAYER_QUICKSTART.md)

### Claiming XP

1. Sign in with Discord at `/login` — you'll land on your characters page
2. Expand **Claim XP**
3. Pick the play period
4. Check each category you earned (1 XP each, up to 7):
   - Posted at least once during the play period
   - Posted a hunting and/or awakening scene
   - Participated in a scene with another character
   - Engaged in conflict with another character
   - Engaged in combat with another character
   - Took an unmitigated stain
   - **Wildcard / Bonus XP** (requires a reason)
5. Paste a **Discord link** for each checked category (required)
6. Submit — staff will review it

### Requesting a Spend

1. On your character page, expand **Request XP Spend**
2. Pick a category (Attribute, Skill, Discipline, etc.)
3. Enter the trait name and dots (current -> new)
4. The XP cost calculates automatically using V5 rules
5. Write a justification
6. Submit — staff will review it

### V5 XP Costs

| Category | Formula | Example |
|----------|---------|---------|
| Attribute | New dots x 5 | Strength 2->3 = 15 XP |
| Skill | New dots x 3 | Firearms 1->2 = 6 XP |
| New Skill (0->1) | Flat 3 | Larceny 0->1 = 3 XP |
| Discipline (In-Clan) | New dots x 5 | Dominate 1->2 = 10 XP |
| Discipline (Out-of-Clan) | New dots x 7 | Auspex 0->1 = 7 XP |
| Caitiff Discipline | New dots x 6 | Any 1->2 = 12 XP |
| Blood Sorcery Ritual | Level x 3 | Level 3 = 9 XP |
| Thin-Blood Alchemy | Level x 3 | Level 2 = 6 XP |
| Advantage | 3 XP per dot purchased | Status 0->2 = 6 XP |

Multi-dot purchases sum each step. Discipline (In-Clan) 1->3 = (2x5) + (3x5) = 25 XP.

---

## Staff Guide

### Reviewing Claims

1. Log in with Discord at the site root
2. Click **XP Claims** in the sidebar (badge shows pending count)
3. Review each claim: see which categories were checked, verify Discord links
4. **Approve** (can adjust the XP amount) or **Deny** (with a note)

### Reviewing Spends

1. Click **XP Spends** in the sidebar
2. The system auto-validates XP cost against V5 rules
3. Green check = cost matches, red warning = mismatch
4. **Approve** (with verified cost) or **Deny** (with a note)

### Managing Characters

- **Roster** -> Add, edit, activate/deactivate characters
- **Character detail** -> Full XP history, all claims and spends
- **Adjust XP** button -> Grant bonus XP, fix mistakes, refund spends
- **Import from Sheet** -> Bulk import XP history from an external Google Sheet

### XP Adjustments

From any character detail page, click **Adjust XP**:

| Type | Effect | Use Case |
|------|--------|----------|
| Grant XP | Adds earned XP | Bonus, retroactive award, correction |
| Remove XP | Subtracts earned XP | Fix over-awarded XP |
| Refund Spend | Returns spent XP | Undo a bad approval |
| Add Spend | Records a spend | Spend that happened outside the app |

Adjustments take effect immediately and are logged to the audit trail.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Data looks stale | Cache is 30 seconds. Wait or restart the app |
| New staff can't log in (prod) | Edit `apps/web/.env`, run `./update-staff-access.sh` |
| New staff can't log in (dev) | Add their Discord ID to `ALLOWED_DISCORD_IDS` in `apps/web/.env` |
| Character has wrong XP | Use **Adjust XP** on their detail page |
| Player claimed wrong period | Deny with a note, they resubmit |
| Import fails on .xlsx file | The file must be a native Google Sheet, not an uploaded Excel file. Open it in Sheets, go to File -> Save as Google Sheets, then use the new URL |
| Port 5000 in use (macOS) | Use port 5001 — macOS AirPlay Receiver uses 5000. `./dev.sh` already handles this |

---

## Project Structure

```text
mcbn-xp-tracker/
├── apps/
│   ├── web/                     # Flask app (Cloud Run deploy target)
│   │   ├── app/
│   │   ├── tests/
│   │   ├── migrations/
│   │   ├── credentials/
│   │   ├── dev.sh
│   │   ├── deploy.sh
│   │   ├── setup-secrets.sh
│   │   └── update-staff-access.sh
│   └── bot/                     # Discord bot (local-host target)
│       ├── src/
│       ├── scripts/
│       └── package.json
├── docs/                        # Architecture/migration/runbooks
├── .github/workflows/ci.yml     # Monorepo CI (web + bot checks)
├── dev.sh                       # Wrapper -> apps/web/dev.sh
├── deploy.sh                    # Wrapper -> apps/web/deploy.sh
├── setup-secrets.sh             # Wrapper -> apps/web/setup-secrets.sh
└── update-staff-access.sh       # Wrapper -> apps/web/update-staff-access.sh
```
