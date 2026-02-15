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
    DISCORD_WEBHOOK_URL = os.environ.get('DISCORD_WEBHOOK_URL', '')

    # Discord OAuth2
    DISCORD_CLIENT_ID = os.environ.get('DISCORD_CLIENT_ID', '')
    DISCORD_CLIENT_SECRET = os.environ.get('DISCORD_CLIENT_SECRET', '')
    DISCORD_REDIRECT_URI = os.environ.get(
        'DISCORD_REDIRECT_URI', 'http://127.0.0.1:5000/auth/callback'
    )
    # Comma-separated list of Discord user IDs allowed staff access
    _allowed_ids = os.environ.get('ALLOWED_DISCORD_IDS', '')
    ALLOWED_DISCORD_IDS = set(
        uid.strip() for uid in _allowed_ids.split(',') if uid.strip()
    )

    # Cache TTL in seconds for Google Sheets reads
    SHEETS_CACHE_TTL = int(os.environ.get('SHEETS_CACHE_TTL', '30'))
