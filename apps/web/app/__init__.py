"""MCbN XP Tracker — Flask application factory."""

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from flask import Flask, request, session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf.csrf import CSRFProtect
from .sheets import SheetsClient
from .db import db
from .db_service import DBService
from .sheets_sync import SheetsSyncWorker

_EASTERN = ZoneInfo('America/New_York')

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


def _upgrade_with_race_retry(upgrade_fn) -> None:
    """Run Alembic's upgrade(), tolerating one specific concurrent-worker race.

    Every gunicorn worker (and every container on a rapid double deploy)
    runs migrations independently against the same remote DB, so two
    processes can race: both read the same current_revision, both apply the
    same (idempotent) migration DDL, but only one can win Alembic's own
    "UPDATE alembic_version ... WHERE version_num = <old>" bookkeeping
    update. The loser raises CommandError ("expected to match one row...
    0 found") even though the schema itself ended up correct.

    Retry once: on retry, upgrade_fn() re-reads current_revision fresh (now
    already at head from the winner) and finds nothing left to do. A
    genuine migration failure still raises — the retry hits the same real
    problem and isn't swallowed.
    """
    try:
        upgrade_fn()
    except Exception as exc:
        logging.getLogger(__name__).warning('db_upgrade_race_retry: %s', exc)
        upgrade_fn()


def create_app():
    app = Flask(__name__)
    app.config.from_object('config.Config')

    # Refuse to serve without a configured session key.
    #
    # config.py generates a random one when FLASK_SECRET_KEY is absent, which keeps
    # anyone from forging a session with a published literal -- but it is not a
    # usable way to RUN. entrypoint.sh starts gunicorn with 2 workers and no
    # --preload, so each worker imports config separately and gets a different key,
    # and Cloud Run runs up to 2 instances on top of that. Sessions would then fail
    # depending on which worker served the request: logins bouncing, and the OAuth
    # callback failing its state check because the worker that stored oauth_state is
    # not the one reading it. Intermittent, per-request, and hard to trace back here.
    #
    # Failing at startup is the safe direction on Cloud Run: a revision that will not
    # start never receives traffic, so the previous healthy revision keeps serving
    # and the deploy goes red instead of the app going subtly wrong.
    if app.config.get('SECRET_KEY_IS_EPHEMERAL'):
        raise RuntimeError(
            'FLASK_SECRET_KEY is not set. Refusing to start: sessions would be '
            'signed with a per-worker key, so logins would fail intermittently. '
            'Set it in apps/web/.env for local runs, or bind the '
            'mcbn-flask-secret secret when deploying.'
        )

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
        from .turso_http import connect as _turso_connect  # noqa: PLC0415
        from sqlalchemy.pool import NullPool  # noqa: PLC0415
        turso_token = app.config.get('TURSO_AUTH_TOKEN', '')

        def _turso_creator():
            return _turso_connect(turso_url, auth_token=turso_token)

        app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {'creator': _turso_creator, 'poolclass': NullPool}
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
            http_timeout_seconds=app.config.get('SHEETS_HTTP_TIMEOUT_SECONDS', 15.0),
        )

    # Initialize DB service and Sheets sync worker
    db_service = DBService(sheets_client=sheets_client)
    if sheets_client:
        sheets_sync = SheetsSyncWorker(sheets_client, flask_app=app, db_service=db_service)

    with app.app_context():
        # db.create_all() handles the baseline schema for fresh installs
        # (the Alembic baseline migration is a no-op).  For existing databases
        # it's a no-op for tables that already exist.
        db.create_all()

        from flask_migrate import upgrade as _db_upgrade, stamp as _db_stamp
        from alembic.migration import MigrationContext

        with db.engine.connect() as _conn:
            _current_rev = MigrationContext.configure(_conn).get_current_revision()

        if _current_rev is None:
            # Fresh install: db.create_all() already built the full schema.
            # Stamp to head so future upgrades start from the right baseline.
            _db_stamp(revision='head')
        else:
            # Existing install: apply any pending migrations (ADD COLUMN, etc.)
            # and keep alembic_version accurate.  All create_table migrations
            # have IF NOT EXISTS guards so they're safe if the table already
            # exists from a prior db.create_all() run.
            _upgrade_with_race_retry(_db_upgrade)

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
    from .blueprints.settings import bp as settings_bp
    from .blueprints.wiki import bp as wiki_bp
    from .blueprints.character_creator import bp as character_creator_bp
    from .blueprints.cc_admin import bp as cc_admin_bp
    from .blueprints.reports import bp as reports_bp
    from .blueprints.coteries import bp as coteries_bp

    app.register_blueprint(dashboard_bp)
    app.register_blueprint(claims_bp, url_prefix='/claims')
    app.register_blueprint(spends_bp, url_prefix='/spends')
    app.register_blueprint(roster_bp, url_prefix='/roster')
    app.register_blueprint(periods_bp, url_prefix='/periods')
    app.register_blueprint(audit_bp, url_prefix='/audit')
    app.register_blueprint(player_bp, url_prefix='/player')
    app.register_blueprint(api_bp, url_prefix='/api')
    app.register_blueprint(local_status_bp)
    app.register_blueprint(settings_bp, url_prefix='/settings')
    app.register_blueprint(wiki_bp, url_prefix='/wiki')
    app.register_blueprint(character_creator_bp)
    app.register_blueprint(cc_admin_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(coteries_bp, url_prefix='/coteries')
    csrf.exempt(api_bp)
    csrf.exempt(character_creator_bp)

    # Jinja2 filter: convert UTC ISO timestamp string to Eastern time display
    def _to_eastern(ts: str) -> str:
        if not ts:
            return ''
        try:
            dt = datetime.fromisoformat(str(ts).replace('Z', '+00:00'))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(_EASTERN).strftime('%Y-%m-%d %H:%M %Z')
        except (ValueError, TypeError):
            return str(ts)

    app.jinja_env.filters['to_eastern'] = _to_eastern

    # Inject auth helpers into all templates
    from .auth import is_staff as _is_staff, is_logged_in as _is_logged_in, is_settings_admin as _is_settings_admin, get_view_as as _get_view_as

    from .cc_access import can_create_characters as _can_create_characters

    @app.context_processor
    def inject_auth():
        return {
            'is_staff': _is_staff(),
            'is_admin': _is_settings_admin(),
            'is_logged_in': _is_logged_in(),
            'current_discord_name': session.get('discord_name', ''),
            'current_discord_id': session.get('discord_id', ''),
            'view_as': _get_view_as(),
            # Templates must never offer an entry point the endpoints would
            # refuse — both sides read this one answer.
            'can_create_characters': _can_create_characters(),
        }

    # JSON error log file — only active when WEB_LOG_DIR is set (local Docker dev)
    _web_log_dir = os.environ.get('WEB_LOG_DIR', '')
    if _web_log_dir:
        _log_path = Path(_web_log_dir) / 'web.err.log'
        _log_path.parent.mkdir(parents=True, exist_ok=True)

        class _JsonFormatter(logging.Formatter):
            def format(self, record: logging.LogRecord) -> str:
                level = 'warn' if record.levelno == logging.WARNING else 'error'
                entry: dict = {
                    'ts': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S'),
                    'level': level,
                    'event': record.name,
                }
                msg = record.getMessage()
                if record.exc_info:
                    msg = self.formatException(record.exc_info) if not msg else f'{msg}\n{self.formatException(record.exc_info)}'
                entry['error'] = msg
                return json.dumps(entry, ensure_ascii=False)

        _fh = logging.FileHandler(_log_path, encoding='utf-8')
        _fh.setLevel(logging.WARNING)
        _fh.setFormatter(_JsonFormatter())
        logging.getLogger().addHandler(_fh)

    # Persist unhandled exceptions to AppLogEntry for the Error Alerts page
    import traceback as _traceback

    @app.errorhandler(Exception)
    def _handle_unhandled_exception(exc):
        from werkzeug.exceptions import HTTPException
        # Let HTTPException (404, 403, abort() calls, etc.) pass through unchanged
        if isinstance(exc, HTTPException):
            return exc
        from .db import AppLogEntry, db as _db
        from .discord_alert import send_escalation_alert, check_escalation, dashboard_link
        message = f'{type(exc).__name__}: {exc}'
        tb = _traceback.format_exc()
        path = request.path if request else ''
        # event is constant ('unhandled_exception') for every web crash — dedupe on
        # exception type + route instead, so one noisy route can't hide an unrelated one.
        dedupe_key = f'web:unhandled_exception:{type(exc).__name__}:{path}'
        try:
            entry = AppLogEntry(
                ts=datetime.now(timezone.utc).isoformat(),
                source='web',
                level='error',
                event='unhandled_exception',
                message=message,
                details=f'{path}\n\n{tb}'[:4000],
                dedupe_key=dedupe_key,
            )
            _db.session.add(entry)
            _db.session.commit()
        except Exception:
            pass
        # Stays quiet below discord_alert.ESCALATION_THRESHOLD occurrences of
        # this exact exception+route — the AppLogEntry row above is already
        # visible to any staff on /audit/errors regardless.
        webhook_url = app.config.get('DISCORD_WEBHOOK_URL', '')
        if webhook_url:
            count = check_escalation(dedupe_key)
            if count:
                # Short excerpt — full traceback lives in AppLogEntry, linked below.
                # Last few lines are usually the actual failing statement.
                tb_excerpt = '\n'.join(tb.strip().splitlines()[-6:])
                link = dashboard_link(app.config.get('DISCORD_REDIRECT_URI', ''),
                                       source='web', level='error', event='unhandled_exception')
                send_escalation_alert(
                    webhook_url, dedupe_key, count, message,
                    details=f'{path}\n{tb_excerpt}' if path else tb_excerpt,
                    link=link,
                )
        # Re-raise so Flask's default 500 handling still applies
        raise exc

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
