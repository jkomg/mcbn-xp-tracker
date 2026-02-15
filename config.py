import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.environ.get('FLASK_SECRET_KEY', 'dev-key-change-me')
    DEBUG = os.environ.get('FLASK_DEBUG', 'false').lower() in ('true', '1', 'yes')
    GOOGLE_CREDENTIALS_FILE = os.environ.get(
        'GOOGLE_CREDENTIALS_FILE', 'credentials/service-account.json'
    )
    # For Cloud Run: service-account JSON passed as env var instead of file
    GOOGLE_CREDENTIALS_JSON = os.environ.get('GOOGLE_CREDENTIALS_JSON', '')
    SPREADSHEET_ID = os.environ.get('SPREADSHEET_ID', '')
    STAFF_PASSWORD = os.environ.get('STAFF_PASSWORD', '')
    DISCORD_WEBHOOK_URL = os.environ.get('DISCORD_WEBHOOK_URL', '')

    # Cache TTL in seconds for Google Sheets reads
    SHEETS_CACHE_TTL = int(os.environ.get('SHEETS_CACHE_TTL', '30'))
