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
| Backend | Flask 3.1 (Python 3.12) | Gunicorn in prod |
| Frontend | Bootstrap 5 | Custom dark VtM theme, mobile-responsive |
| Database | Google Sheets (6 tabs) | Free, no server needed |
| Auth | Discord OAuth2 | All users; staff vs player by Discord ID |
| Hosting | Google Cloud Run | Free tier, scales to zero |
| Secrets | GCP Secret Manager | All credentials stored securely in prod |

### Free Tier Design

The app is specifically designed to run within Google Cloud's free tier:

- **Cloud Run**: 2 million requests/month free. The app scales to **zero instances** when idle, so you only use resources when someone's on the site.
- **Artifact Registry**: Stores the Docker image. Free tier covers small projects.
- **Secret Manager**: 6 secrets, rarely accessed. Well within free limits.
- **Google Sheets API**: 300 requests/minute free. The app caches reads for 30 seconds to stay well under this.

In practice this costs **$0/month** for a chronicle our size.

### 2026-02 Security + Performance Update

This release adds CSRF protection, session/cookie hardening, API token comparison hardening, API rate limits, safer login redirects, and lower-chattiness Google Sheets write paths.

Expected GCP impact:

- **No new paid GCP products** were introduced.
- **Cloud Run resource settings are unchanged** (same CPU/memory/min/max instances).
- **Request volume is effectively unchanged** for normal use.
- **Google Sheets API usage is lower or unchanged** due to batching and append optimizations.

---

## Local Development

### Prerequisites

- Python 3.12+
- A Google Cloud service account with Sheets API access
- A Discord OAuth2 application

### First-Time Setup

```bash
# Clone and set up Python environment
git clone <repo-url> && cd mcbn-xp-tracker
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your credentials (see below)

# Place your Google service account key
# Save the JSON file as: credentials/service-account.json

# Initialize Google Sheet tabs (safe to re-run)
python3 -c "from app import create_app; app = create_app(); from app import sheets_client; sheets_client.setup_sheets()"
```

### Running the Dev Server

```bash
./dev.sh
```

That's it. Opens at **http://127.0.0.1:5001** with debug mode and auto-reload. The script kills any existing process on port 5001 first, so it's safe to run repeatedly.

> **Why port 5001?** macOS AirPlay Receiver squats on port 5000.

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

- **Dev** reads credentials from `.env` and `credentials/service-account.json`
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
./deploy.sh
```

Builds a Docker image, pushes to Artifact Registry, deploys to Cloud Run. Takes about 2-3 minutes. The app runs with 256MB RAM, scales 0-2 instances, and auto-sleeps when idle.

### Updating Staff Access

When you need to add or remove staff Discord IDs:

1. Edit `ALLOWED_DISCORD_IDS` in `.env`
2. Run:
   ```bash
   ./update-staff-access.sh
   ```

This reads the IDs from your `.env`, pushes them to GCP Secret Manager, and updates Cloud Run in one step.

---

## Utility Scripts

| Script | What It Does |
|--------|-------------|
| `./dev.sh` | Start local dev server on port 5001 |
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
| New staff can't log in (prod) | Edit `.env`, run `./update-staff-access.sh` |
| New staff can't log in (dev) | Add their Discord ID to `ALLOWED_DISCORD_IDS` in `.env` |
| Character has wrong XP | Use **Adjust XP** on their detail page |
| Player claimed wrong period | Deny with a note, they resubmit |
| Import fails on .xlsx file | The file must be a native Google Sheet, not an uploaded Excel file. Open it in Sheets, go to File -> Save as Google Sheets, then use the new URL |
| Port 5000 in use (macOS) | Use port 5001 — macOS AirPlay Receiver uses 5000. `./dev.sh` already handles this |

---

## Project Structure

```
mcbn-xp-tracker/
├── dev.sh                       # Start local dev server
├── deploy.sh                    # Deploy to Cloud Run
├── update-staff-access.sh       # Push Discord IDs to prod
├── setup-secrets.sh             # One-time GCP secrets setup
├── Dockerfile                   # Container definition
├── requirements.txt             # Python dependencies
├── .env                         # Local config (not committed)
├── credentials/
│   └── service-account.json     # Google API key (not committed)
├── app/
│   ├── __init__.py              # App factory
│   ├── auth.py                  # Discord OAuth2
│   ├── config.py                # Configuration
│   ├── models.py                # Data classes
│   ├── sheets.py                # Google Sheets client (the "database")
│   ├── xp_rules.py              # V5 XP cost calculations
│   ├── blueprints/
│   │   ├── dashboard.py         # Home + login/logout
│   │   ├── claims.py            # Claim review (staff)
│   │   ├── spends.py            # Spend review (staff)
│   │   ├── roster.py            # Character management
│   │   ├── periods.py           # Play period management
│   │   ├── player.py            # Player portal (Discord auth)
│   │   ├── api.py               # JSON API endpoints
│   │   └── audit.py             # Audit log viewer
│   ├── templates/               # Jinja2 HTML templates
│   │   ├── base.html            # Staff layout (sidebar + offcanvas mobile nav)
│   │   ├── player/              # Player-facing pages
│   │   ├── claims/              # Claim review pages
│   │   ├── spends/              # Spend review pages
│   │   ├── roster/              # Character management pages
│   │   ├── periods/             # Play period pages
│   │   └── audit/               # Audit log page
│   └── static/
│       ├── css/style.css        # VtM dark theme
│       └── js/app.js            # Client-side utilities
└── migrations/
    └── migrate_csv_to_sheets.py # One-time CSV import (historical)
```
