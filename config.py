import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


class Config:
    DEBUG = os.environ.get('FLASK_DEBUG', 'false').lower() in ('true', '1', 'yes')
    SECRET_KEY = os.environ.get('FLASK_SECRET_KEY', 'dev-key-change-me')
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = os.environ.get('SESSION_COOKIE_SAMESITE', 'Lax')
    SESSION_COOKIE_SECURE = os.environ.get(
        'SESSION_COOKIE_SECURE', 'false' if DEBUG else 'true'
    ).lower() in ('true', '1', 'yes')
    REMEMBER_COOKIE_SECURE = SESSION_COOKIE_SECURE
    PERMANENT_SESSION_LIFETIME = timedelta(
        seconds=int(os.environ.get('SESSION_LIFETIME_SECONDS', '43200'))
    )
    WTF_CSRF_TIME_LIMIT = None
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
        'DISCORD_REDIRECT_URI', 'http://127.0.0.1:5001/auth/callback'
    )
    # Comma-separated list of Discord user IDs allowed staff access
    _allowed_ids = os.environ.get('ALLOWED_DISCORD_IDS', '')
    ALLOWED_DISCORD_IDS = set(
        uid.strip() for uid in _allowed_ids.split(',') if uid.strip()
    )

    # Cache TTL in seconds for Google Sheets reads
    SHEETS_CACHE_TTL = int(os.environ.get('SHEETS_CACHE_TTL', '30'))

    # Shared bearer token for bot-facing API endpoints
    WEB_APP_API_TOKEN = os.environ.get('WEB_APP_API_TOKEN', '')
