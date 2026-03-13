"""MCbN XP Tracker — Flask application factory."""

import os
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from flask import Flask, request, session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf.csrf import CSRFProtect
from .sheets import SheetsClient
from .db import db
from .db_service import DBService
from .sheets_sync import SheetsSyncWorker

# Module-level singletons
sheets_client: SheetsClient = None
db_service: DBService = None
sheets_sync: SheetsSyncWorker = None
limiter: Limiter = None
csrf: CSRFProtect = CSRFProtect()


def _apply_local_session_cookie_defaults(app: Flask, session_cookie_secure_configured: bool | None = None) -> None:
    """Avoid secure-cookie OAuth loops for localhost HTTP development.

    When running local OAuth callbacks over plain HTTP (127.0.0.1/localhost),
    secure cookies are not sent by browsers. That drops session state and can
    cause repeated Discord OAuth redirects. Keep production behavior intact by
    only overriding when SESSION_COOKIE_SECURE is not explicitly configured.
    """
    if session_cookie_secure_configured is None:
        session_cookie_secure_configured = 'SESSION_COOKIE_SECURE' in os.environ
    if session_cookie_secure_configured:
        return

    redirect_uri = app.config.get('DISCORD_REDIRECT_URI', '')
    parsed = urlparse(redirect_uri)
    if parsed.scheme != 'http':
        return
    if parsed.hostname not in {'127.0.0.1', 'localhost', '::1'}:
        return

    app.config['SESSION_COOKIE_SECURE'] = False
    app.config['REMEMBER_COOKIE_SECURE'] = False


def create_app():
    app = Flask(__name__)
    app.config.from_object('config.Config')
    _apply_local_session_cookie_defaults(app)
    csrf.init_app(app)
    # Ensure SQLite data directory exists on first boot.
    # Use app.root_path (the package dir) parent as the base so the resolved
    # path matches how SQLite opens relative URIs (from the process CWD).
    raw_db_url = app.config.get('SQLALCHEMY_DATABASE_URI', '')
    if raw_db_url.startswith('sqlite:///'):
        # Strip sqlite:/// (3 slashes); absolute paths start with / giving //path → strip one more.
        db_path_str = raw_db_url[len('sqlite:///'):]
        db_path = Path(db_path_str) if db_path_str.startswith('/') else Path(app.root_path).parent / db_path_str
        db_path.parent.mkdir(parents=True, exist_ok=True)

    turso_url = app.config.get('TURSO_CONNECT_URL', '')
    if turso_url:
        import libsql_experimental as libsql  # noqa: PLC0415
        turso_token = app.config.get('TURSO_AUTH_TOKEN', '')

        class _LibSQLConn:
            """Proxy that adds a no-op create_function so pysqlite dialect is happy."""
            def __init__(self, conn):
                self._c = conn
            def __getattr__(self, name):
                return getattr(self._c, name)
            def create_function(self, *a, **kw):
                pass
            def cursor(self, *a, **kw):
                return self._c.cursor(*a, **kw)

        def _turso_creator():
            return _LibSQLConn(libsql.connect(turso_url, auth_token=turso_token))
        app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {'creator': _turso_creator}
    db.init_app(app)
    from flask_migrate import Migrate
    Migrate(app, db)
    project_root = Path(__file__).resolve().parents[2]

    # Rate limiting — uses in-memory storage (resets on deploy, fine for this scale)
    global limiter
    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=["120 per minute"],   # Global: 2 req/sec average
        storage_uri="memory://",
    )

    # Initialize Google Sheets client
    global sheets_client, db_service, sheets_sync
    if app.config['SPREADSHEET_ID']:
        sheets_client = SheetsClient(
            credentials_file=app.config['GOOGLE_CREDENTIALS_FILE'],
            credentials_json=app.config.get('GOOGLE_CREDENTIALS_JSON', ''),
            spreadsheet_id=app.config['SPREADSHEET_ID'],
            cache_ttl=app.config.get('SHEETS_CACHE_TTL', 30),
            validate_headers_on_startup=app.config.get('SHEETS_VALIDATE_HEADERS_ON_STARTUP', False),
            startup_max_retries=app.config.get('SHEETS_STARTUP_MAX_RETRIES', 5),
            startup_retry_base_seconds=app.config.get('SHEETS_STARTUP_RETRY_BASE_SECONDS', 1.5),
        )

    # Initialize DB service and Sheets sync worker
    db_service = DBService(sheets_client=sheets_client)
    if sheets_client:
        sheets_sync = SheetsSyncWorker(sheets_client)

    # Create DB tables if they don't exist
    with app.app_context():
        db.create_all()

    # Register blueprints
    from .blueprints.dashboard import bp as dashboard_bp
    from .blueprints.claims import bp as claims_bp
    from .blueprints.spends import bp as spends_bp
    from .blueprints.roster import bp as roster_bp
    from .blueprints.periods import bp as periods_bp
    from .blueprints.audit import bp as audit_bp
    from .blueprints.player import bp as player_bp
    from .blueprints.api import bp as api_bp
    from .blueprints.local_status import bp as local_status_bp

    app.register_blueprint(dashboard_bp)
    app.register_blueprint(claims_bp, url_prefix='/claims')
    app.register_blueprint(spends_bp, url_prefix='/spends')
    app.register_blueprint(roster_bp, url_prefix='/roster')
    app.register_blueprint(periods_bp, url_prefix='/periods')
    app.register_blueprint(audit_bp, url_prefix='/audit')
    app.register_blueprint(player_bp, url_prefix='/player')
    app.register_blueprint(api_bp, url_prefix='/api')
    app.register_blueprint(local_status_bp)
    csrf.exempt(api_bp)

    # Inject auth helpers into all templates
    from .auth import is_staff as _is_staff, is_logged_in as _is_logged_in

    @app.context_processor
    def inject_auth():
        return {
            'is_staff': _is_staff(),
            'is_logged_in': _is_logged_in(),
            'current_discord_name': session.get('discord_name', ''),
            'current_discord_id': session.get('discord_id', ''),
        }

    if app.config.get('LOCAL_STATUS_ENABLED', False):
        access_log_file = Path(app.config.get('LOCAL_STATUS_ACCESS_LOG_FILE', '.run/logs/access.log'))
        if not access_log_file.is_absolute():
            access_log_file = project_root / access_log_file
        access_log_file.parent.mkdir(parents=True, exist_ok=True)

        @app.before_request
        def _record_local_access():
            user_id = session.get('discord_id') or '-'
            method = request.method
            path = request.full_path.rstrip('?')
            remote_addr = request.remote_addr or '-'
            ua = (request.user_agent.string or '-').replace('\n', ' ').replace('\r', ' ')
            line = (
                f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] '
                f'{remote_addr} user={user_id} {method} {path} ua="{ua}"\n'
            )
            with access_log_file.open('a', encoding='utf-8') as fh:
                fh.write(line)

    return app
