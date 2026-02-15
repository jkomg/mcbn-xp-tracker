# MCbN XP Tracker

XP tracking and management system for the **Music City by Night** Vampire: The Masquerade V5 chronicle.

## Architecture

- **Backend:** Google Sheets (via `gspread` API)
- **Frontend:** Flask + Bootstrap 5 (dark theme)
- **Player Input:** Google Forms (XP Claims + XP Spends)
- **Automation:** Google Apps Script (form dropdown sync, duplicate detection)

## Setup

### 1. Google Cloud

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable **Google Sheets API** and **Google Drive API**
3. Create a Service Account (IAM → Service Accounts)
4. Download the JSON key → save as `credentials/service-account.json`

### 2. Google Sheet

1. Create a new Google Sheet
2. Share it with the service account email (Editor)
3. Copy the Sheet ID from the URL: `docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`

### 3. Environment

```bash
cp .env.example .env
# Edit .env with your values:
#   SPREADSHEET_ID=your-sheet-id
#   STAFF_PASSWORD=your-password
#   FLASK_SECRET_KEY=random-string
```

### 4. Install & Run

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Set up sheet tabs (run once)
python -c "from app import create_app; app = create_app(); from app import sheets_client; sheets_client.setup_sheets()"

# Migrate existing data (run once)
python migrations/migrate_csv_to_sheets.py

# Start the app
python run.py
```

### 5. Google Forms

Create two Google Forms manually and link their responses to the sheet:

**XP Claim Form:**
1. Character Name (Dropdown)
2. Play Period (Dropdown)
3. Six checkbox+link sections for each XP category

**XP Spend Form:**
1. Character Name (Dropdown)
2. Spend Category (Dropdown)
3. Trait Name, Current Dots, New Dots, XP Cost, In-Clan?, Justification

Then paste `google_apps_script/form_sync_script.js` into the sheet's Apps Script editor and update the form IDs.

## Staff Dashboard

Access at `http://localhost:5000`. Features:
- XP claim review and approval
- Spend request review with V5 cost validation
- Character roster management
- Play period management
- Full audit trail
