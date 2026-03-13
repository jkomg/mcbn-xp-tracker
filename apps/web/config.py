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
    SHEETS_VALIDATE_HEADERS_ON_STARTUP = os.environ.get(
        'SHEETS_VALIDATE_HEADERS_ON_STARTUP', 'false'
    ).lower() in ('true', '1', 'yes')
    SHEETS_STARTUP_MAX_RETRIES = int(
        os.environ.get('SHEETS_STARTUP_MAX_RETRIES', '5')
    )
    SHEETS_STARTUP_RETRY_BASE_SECONDS = float(
        os.environ.get('SHEETS_STARTUP_RETRY_BASE_SECONDS', '1.5')
    )

    # Shared bearer token for bot-facing API endpoints
    WEB_APP_API_TOKEN = os.environ.get('WEB_APP_API_TOKEN', '')
    WEB_APP_API_READ_TOKEN = os.environ.get('WEB_APP_API_READ_TOKEN', '')
    WEB_APP_API_WRITE_TOKEN = os.environ.get('WEB_APP_API_WRITE_TOKEN', '')

    # Optional replay protection for bot write endpoints (/api/claims, /api/spends)
    BOT_API_REPLAY_PROTECTION_ENABLED = os.environ.get(
        'BOT_API_REPLAY_PROTECTION_ENABLED', 'false'
    ).lower() in ('true', '1', 'yes')
    BOT_API_REPLAY_WINDOW_SECONDS = int(
        os.environ.get('BOT_API_REPLAY_WINDOW_SECONDS', '300')
    )
    BOT_API_NONCE_TTL_SECONDS = int(
        os.environ.get('BOT_API_NONCE_TTL_SECONDS', '600')
    )
    BOT_API_NONCE_CACHE_SIZE = int(
        os.environ.get('BOT_API_NONCE_CACHE_SIZE', '10000')
    )

    # Optional auto-generation of the next play period.
    AUTO_CREATE_PERIODS_ENABLED = os.environ.get(
        'AUTO_CREATE_PERIODS_ENABLED', 'false'
    ).lower() in ('true', '1', 'yes')
    AUTO_CREATE_PERIODS_OPEN_LEAD_DAYS = int(
        os.environ.get('AUTO_CREATE_PERIODS_OPEN_LEAD_DAYS', '1')
    )
    AUTO_CREATE_PERIODS_DEFAULT_LENGTH_DAYS = int(
        os.environ.get('AUTO_CREATE_PERIODS_DEFAULT_LENGTH_DAYS', '14')
    )
    AUTO_CREATE_PERIODS_DEFAULT_GAP_DAYS = int(
        os.environ.get('AUTO_CREATE_PERIODS_DEFAULT_GAP_DAYS', '0')
    )

    # Database (SQLite for local dev, Turso/libSQL for production)
    # libsql-experimental is a DB-API driver, not a SQLAlchemy dialect.
    # When DATABASE_URL is a libsql URL, store the real URL in TURSO_CONNECT_URL
    # and point SQLAlchemy at pysqlite (same SQL dialect, real connection via creator).
    _raw_db_url = os.environ.get('DATABASE_URL', 'sqlite:///data/db.sqlite')
    TURSO_AUTH_TOKEN = os.environ.get('TURSO_AUTH_TOKEN', '')
    if _raw_db_url.startswith('libsql'):
        SQLALCHEMY_DATABASE_URI = 'sqlite+pysqlite:///:memory:'
        TURSO_CONNECT_URL = _raw_db_url.replace('libsql+https://', 'https://').replace('libsql://', 'https://')
    else:
        # Resolve relative sqlite paths to absolute so SQLite and mkdir agree on the location.
        if _raw_db_url.startswith('sqlite:///') and not _raw_db_url.startswith('sqlite:////'):
            _db_rel = _raw_db_url[len('sqlite:///'):]
            _db_abs = os.path.join(os.path.dirname(os.path.abspath(__file__)), _db_rel)
            SQLALCHEMY_DATABASE_URI = 'sqlite:///' + _db_abs
        else:
            SQLALCHEMY_DATABASE_URI = _raw_db_url
        TURSO_CONNECT_URL = ''
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Local-only diagnostics page (launchd/logs/access tail).
    LOCAL_STATUS_ENABLED = os.environ.get(
        'LOCAL_STATUS_ENABLED', 'false'
    ).lower() in ('true', '1', 'yes')
    LOCAL_STATUS_ACCESS_LOG_FILE = os.environ.get(
        'LOCAL_STATUS_ACCESS_LOG_FILE', '.run/logs/access.log'
    )
    LOCAL_STATUS_LOG_LINES = int(
        os.environ.get('LOCAL_STATUS_LOG_LINES', '120')
    )
