# MCbN XP Tracker

XP tracking and management system for **Music City by Night**, a Vampire: The Masquerade V5 chronicle set in Nashville, TN.

## How It Works

The system has three user roles with different tools:

| Role | Tool | What They Do |
|------|------|-------------|
| **Players** | Google Forms | Submit XP claims and spend requests |
| **Staff (STs)** | Flask Web App | Review, approve/deny, adjust XP, manage roster |
| **Owner** | Google Sheet + Apps Script | Backend data, automation, form sync |

### Data Flow

```
Players submit via Google Forms
        ↓
Responses land in Google Sheet tabs
        ↓
Staff reviews in Flask dashboard → Approve / Deny
        ↓
XP totals auto-calculated from approved claims & spends
        ↓
All actions logged to Audit Trail
```

---

## Architecture

- **Database:** Google Sheets (6 tabs)
- **Staff Dashboard:** Flask + Bootstrap 5 (dark VtM theme)
- **Player Input:** Two Google Forms (XP Claim + XP Spend)
- **Automation:** Google Apps Script (dropdown sync, duplicate detection, triggers)

---

## Installation & Setup

### 1. Google Cloud Service Account

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable **Google Sheets API** and **Google Drive API**
4. Go to IAM → Service Accounts → Create Service Account
5. Download the JSON key file
6. Save it as `credentials/service-account.json` in the project root

### 2. Google Sheet

1. Create a new Google Sheet
2. Share it with the service account email address (as **Editor**)
3. Copy the Sheet ID from the URL: `docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`

### 3. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
FLASK_SECRET_KEY=generate-a-random-string-here
FLASK_DEBUG=true
GOOGLE_CREDENTIALS_FILE=credentials/service-account.json
SPREADSHEET_ID=your-google-sheet-id
STAFF_PASSWORD=your-staff-password
SHEETS_CACHE_TTL=30
```

### 4. Install & Run

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Initialize sheet tabs (safe to run multiple times)
python -c "from app import create_app; app = create_app(); from app import sheets_client; sheets_client.setup_sheets()"

# Optional: migrate existing character data from CSV
python migrations/migrate_csv_to_sheets.py

# Start the app
python run.py
```

The app runs at **http://localhost:5000**.

### 5. Google Forms Setup

Create two Google Forms and link their responses to the sheet:

#### XP Claim Form

| Question | Type | Notes |
|----------|------|-------|
| Character Name | Dropdown | Auto-populated by Apps Script |
| Play Period | Dropdown | Auto-populated by Apps Script |
| Posted at least once | Checkbox | 1 XP category |
| Posted once — Discord link | Short answer | Evidence link |
| Hunting / Awakening scene | Checkbox | 1 XP category |
| Hunting — Discord link | Short answer | Evidence link |
| Scene with another character | Checkbox | 1 XP category |
| Scene — Discord link | Short answer | Evidence link |
| Conflict with another character | Checkbox | 1 XP category |
| Conflict — Discord link | Short answer | Evidence link |
| Combat with another character | Checkbox | 1 XP category |
| Combat — Discord link | Short answer | Evidence link |
| Unmitigated stain | Checkbox | 1 XP category |
| Stain — Discord link | Short answer | Evidence link |

Each category is worth 1 XP. Players can earn up to **6 XP per play period**.

#### XP Spend Form

| Question | Type | Notes |
|----------|------|-------|
| Character Name | Dropdown | Auto-populated by Apps Script |
| Spend Category | Dropdown | Attribute, Skill, Discipline, etc. |
| Trait Name | Short answer | e.g., "Strength", "Dominate" |
| Current Dots | Number | Current rating (0-5) |
| New Dots | Number | Desired rating |
| XP Cost | Number | Player-calculated cost |
| Is In-Clan? | Checkbox | For Discipline purchases |
| Justification | Paragraph | Why they're buying this |

### 6. Apps Script Setup

1. Open your Google Sheet → **Extensions → Apps Script**
2. Paste the contents of `google_apps_script/form_sync_script.js`
3. Update the two form ID constants at the top with your actual form IDs
4. Run `setupAllTriggers()` once to create:
   - Daily sync at 6 AM (refreshes form dropdowns)
   - XP form submit handler (duplicate detection + auto-XP count)
   - Spend form submit handler (auto-sets "Pending" status)
5. Run `syncFormsWithSheet()` to do the initial dropdown population

---

## For Staff (STs): Using the Dashboard

### Logging In

Go to `http://localhost:5000` and enter your name and the shared staff password. Your name is used for the audit trail — use something identifiable.

### Dashboard (Home Page)

Shows at a glance:
- **Active character count**
- **Pending claims** and **pending spends** waiting for review
- **Full character table** with XP breakdown (Creation XP, Earned, Total, Spends, Available)
- Click any character name to see their full detail page

### Reviewing XP Claims

1. Click **XP Claims** in the sidebar (badge shows pending count)
2. You'll see all pending claims with character name, period, and XP amount
3. Click a claim to review:
   - See which 6 categories the player checked
   - See their Discord evidence links
   - **Approve** with the claimed amount, or enter a different amount
   - **Deny** with an ST note explaining why
4. Use **Claims History** to see all past claims (approved, denied, duplicates)

### Reviewing XP Spends

1. Click **XP Spends** in the sidebar
2. Review each spend request:
   - The system **auto-validates** the XP cost against V5 rules
   - A green checkmark means the player's cost matches; a red warning means mismatch
   - You can see the **correct cost** and the player's submitted cost side-by-side
   - You can see the character's **available XP** to check if they can afford it
   - **Approve** with the verified cost (can override the player's amount)
   - **Deny** with a note
3. Use **Spends History** to see all past spend requests

### Managing the Roster

**Roster List** (`/roster/`):
- View all characters with filters: Active / Inactive / All, by Clan, by Sect
- Inactive characters appear faded

**Character Detail** (click a character name):
- XP summary cards: Creation XP, Earned XP, Total XP, Approved Spends, Available XP
- Character info (clan, sect, age, Discord, enemy, notes)
- Full XP claims history table
- Full spend history table
- Activate/Deactivate button

**Adding a Character** (`/roster/add`):
- Required: Character name
- Optional: Player Discord, clan, age category, sect, creation XP, enemy, notes

**Editing a Character** (Edit button on detail page):
- Can change any field except the character name
- Can adjust **Creation / Audit XP** — this is the baseline XP the character started with

### XP Adjustments (Corrections & Manual Edits)

This is the tool for fixing XP problems, granting bonus XP, or correcting mistakes.

**From any character detail page, click the yellow "Adjust XP" button.**

Four adjustment types:

| Type | Effect | Use Case |
|------|--------|----------|
| **Grant XP** | Adds earned XP | Bonus XP, retroactive award, data correction |
| **Remove XP** | Subtracts earned XP | Correct over-awarded XP, fix mistakes |
| **Refund Spend** | Returns XP from spends | Undo a wrongly approved spend, retcon |
| **Add Spend** | Records a retroactive spend | Spend that happened outside the form system |

How it works:
- Enter the XP amount (always positive — the type determines direction)
- Write a reason (required — logged to audit trail)
- A live preview shows what the character's XP will look like after
- Adjustments take effect **immediately** (auto-approved)
- Everything is logged: who made it, when, why, and the exact amounts

### Play Periods

1. Click **Play Periods** in the sidebar
2. **Add Period**: Enter start/end dates; night number auto-increments
3. **Toggle Submissions**: Open or close a period for player submissions
4. **Toggle Active**: Show or hide a period in the Google Form dropdowns
5. Active periods with open submissions appear in the XP Claim form's Play Period dropdown

### Audit Log

Shows every staff action with timestamp, who did it, what they did, and to which character. Filter by:
- Action type (approve, deny, edit, adjust, etc.)
- Character name
- Staff member

---

## For Players: Submitting XP Claims

### Claiming XP for a Play Period

1. Open the **XP Claim Form** (link provided by your ST)
2. Select your **Character Name** from the dropdown
3. Select the **Play Period** you're claiming for
4. Check each category you qualify for (up to 6 XP):
   - **Posted at least once** — You posted in the Discord RP channels
   - **Hunting / Awakening scene** — Your character hunted or had an awakening scene
   - **Scene with another character** — RP'd with another PC
   - **Conflict with another character** — Had a conflict with another PC
   - **Combat with another character** — Engaged in combat with another PC
   - **Unmitigated stain** — Your character gained an unmitigated stain
5. For each category checked, paste a **Discord link** to the relevant post as evidence
6. Submit — your claim will be reviewed by staff

**Important:**
- You can only claim once per character per period (duplicates are auto-flagged)
- Claims start as "Pending" until staff reviews them
- Staff may approve a different amount than you claimed if evidence doesn't support it

### Spending XP

1. Open the **XP Spend Form** (link provided by your ST)
2. Select your **Character Name**
3. Select the **Spend Category** (Attribute, Skill, Discipline, etc.)
4. Enter the **Trait Name** (e.g., "Strength", "Dominate", "Resources")
5. Enter your **Current Dots** and desired **New Dots**
6. Enter the **XP Cost** — calculate using the V5 rules below
7. Check **Is In-Clan?** if buying an in-clan Discipline
8. Write a **Justification** explaining why your character is learning this
9. Submit — staff will review and verify the cost

### V5 XP Cost Reference

| Category | Cost Formula | Example |
|----------|-------------|---------|
| Attribute | New rating × 5 | Strength 2→3 = 15 XP |
| Skill | New rating × 3 | Firearms 1→2 = 6 XP |
| New Skill (0→1) | 3 XP flat | Larceny 0→1 = 3 XP |
| Discipline (In-Clan) | New rating × 5 | Dominate 0→2 = 5+10 = 15 XP |
| Discipline (Out-of-Clan) | New rating × 7 | Auspex 0→1 = 7 XP |
| Caitiff Discipline | New rating × 6 | Any 1→2 = 12 XP |
| Blood Sorcery Ritual | Ritual level × 3 | Level 3 ritual = 9 XP |
| Thin-Blood Alchemy | Formula level × 3 | Level 2 formula = 6 XP |
| Advantage (Merit/Background) | New rating × 3 | Resources 2→3 = 9 XP |

For multi-dot purchases, add each step. Example: Discipline (In-Clan) 1→3 = (2×5) + (3×5) = 25 XP.

---

## For the Owner: Backend Management

### Google Sheet Structure

| Tab | Purpose | Managed By |
|-----|---------|------------|
| **Roster** | Character master list | Flask app (add/edit/activate) |
| **Play Periods** | Night schedule & submission windows | Flask app (create/toggle) |
| **XP Responses** | XP claim form submissions + staff reviews | Google Form + Flask |
| **Spend Requests** | Spend form submissions + staff reviews | Google Form + Flask |
| **Audit Log** | Complete staff action history | Flask (auto-appended) |

### XP Calculation

```
Total XP     = Creation XP + Sum(Approved Claims) + Sum(Staff Adjustments)
Available XP = Total XP - Sum(Approved Spends)
```

- **Creation XP**: Set when adding a character; editable on the character edit page
- **Earned XP**: Sum of all approved claims (including staff adjustments marked as "Staff Adjustment")
- **Approved Spends**: Sum of all approved spend requests (including spend adjustments)

### Apps Script Automation

The bound Apps Script handles three things automatically:

1. **Daily Dropdown Sync** (6 AM): Reads active characters from Roster and active periods from Play Periods, updates both Google Forms' dropdowns
2. **XP Form Submission**: Auto-counts checked categories, sets `xp_claimed`, flags duplicates (same character + same period)
3. **Spend Form Submission**: Sets initial status to "Pending"

To manually trigger a dropdown sync: Open Apps Script editor → Select `syncFormsWithSheet` → Run.

### Troubleshooting

| Problem | Solution |
|---------|----------|
| Form dropdowns empty | Run `syncFormsWithSheet` in Apps Script; check that characters/periods are marked Active |
| "No item with given ID" error | Form ID in the script doesn't match the actual form. Check the form URL and update the constant |
| Stale data in Flask | The cache has a 30-second TTL. Wait 30 seconds or restart the app |
| Character shows negative XP | Use the **Adjust XP** tool on the character detail page to correct |
| Player submitted wrong claim | Deny the claim with a note; player resubmits |
| Need to fix a past approval | Use **Adjust XP** → Remove XP or Refund Spend with a reason |
| Form responses in wrong tab | Forms auto-create tabs. If tab names don't match, rename them to "XP Responses" and "Spend Requests" |

---

## Project Structure

```
mcbn-xp-tracker/
├── run.py                          # Flask entry point
├── .env                            # Environment config (not committed)
├── requirements.txt                # Python dependencies
├── credentials/                    # Google service account key (not committed)
│   └── service-account.json
├── app/
│   ├── __init__.py                 # Flask app factory
│   ├── auth.py                     # Staff authentication
│   ├── models.py                   # Data classes (Character, XPClaim, etc.)
│   ├── sheets.py                   # Google Sheets API client
│   ├── xp_rules.py                 # V5 XP cost calculations
│   ├── blueprints/
│   │   ├── dashboard.py            # Home + login/logout
│   │   ├── claims.py               # XP claim review
│   │   ├── spends.py               # Spend request review
│   │   ├── roster.py               # Character management + XP adjustments
│   │   ├── periods.py              # Play period management
│   │   └── audit.py                # Audit log viewer
│   ├── templates/                  # Jinja2 HTML templates
│   │   ├── base.html               # Layout with sidebar nav
│   │   ├── login.html
│   │   ├── dashboard.html
│   │   ├── claims/
│   │   ├── spends/
│   │   ├── roster/
│   │   │   ├── list.html
│   │   │   ├── detail.html
│   │   │   ├── add.html
│   │   │   ├── edit.html
│   │   │   └── adjust_xp.html     # Manual XP correction tool
│   │   ├── periods/
│   │   └── audit/
│   └── static/
│       ├── css/style.css           # VtM dark theme overrides
│       └── js/app.js               # Client-side search, sort, confirm dialogs
├── google_apps_script/
│   └── form_sync_script.js         # Apps Script for form automation
└── migrations/
    └── migrate_csv_to_sheets.py    # One-time CSV data import
```

---

## Security Notes

**Current (Phase 1):**
- Single shared staff password (all STs use the same password)
- Session-based authentication via Flask
- All staff actions logged with the staff member's name
- Google Sheets accessed via service account (not user credentials)

**For production deployment:**
- Change `FLASK_SECRET_KEY` to a random string (`python -c "import secrets; print(secrets.token_hex(32))"`)
- Set a strong `STAFF_PASSWORD`
- Set `FLASK_DEBUG=false`
- Use HTTPS (reverse proxy with nginx/Caddy)
- Consider adding Discord OAuth for per-user authentication (Phase 2)
