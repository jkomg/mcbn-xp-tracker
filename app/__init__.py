"""MCbN XP Tracker — Flask application factory."""

from flask import Flask, session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf.csrf import CSRFProtect
from .sheets import SheetsClient

# Module-level singletons
sheets_client: SheetsClient = None
limiter: Limiter = None
csrf: CSRFProtect = CSRFProtect()


def create_app():
    app = Flask(__name__)
    app.config.from_object('config.Config')
    csrf.init_app(app)

    # Rate limiting — uses in-memory storage (resets on deploy, fine for this scale)
    global limiter
    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=["120 per minute"],   # Global: 2 req/sec average
        storage_uri="memory://",
    )

    # Initialize Google Sheets client
    global sheets_client
    if app.config['SPREADSHEET_ID']:
        sheets_client = SheetsClient(
            credentials_file=app.config['GOOGLE_CREDENTIALS_FILE'],
            credentials_json=app.config.get('GOOGLE_CREDENTIALS_JSON', ''),
            spreadsheet_id=app.config['SPREADSHEET_ID'],
            cache_ttl=app.config.get('SHEETS_CACHE_TTL', 30),
        )

    # Register blueprints
    from .blueprints.dashboard import bp as dashboard_bp
    from .blueprints.claims import bp as claims_bp
    from .blueprints.spends import bp as spends_bp
    from .blueprints.roster import bp as roster_bp
    from .blueprints.periods import bp as periods_bp
    from .blueprints.audit import bp as audit_bp
    from .blueprints.player import bp as player_bp
    from .blueprints.api import bp as api_bp

    app.register_blueprint(dashboard_bp)
    app.register_blueprint(claims_bp, url_prefix='/claims')
    app.register_blueprint(spends_bp, url_prefix='/spends')
    app.register_blueprint(roster_bp, url_prefix='/roster')
    app.register_blueprint(periods_bp, url_prefix='/periods')
    app.register_blueprint(audit_bp, url_prefix='/audit')
    app.register_blueprint(player_bp, url_prefix='/player')
    app.register_blueprint(api_bp, url_prefix='/api')
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

    return app
