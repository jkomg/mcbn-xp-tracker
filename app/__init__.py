"""MCbN XP Tracker — Flask application factory."""

from flask import Flask
from .sheets import SheetsClient

# Module-level singleton for the Sheets client
sheets_client: SheetsClient = None


def create_app():
    app = Flask(__name__)
    app.config.from_object('config.Config')

    # Initialize Google Sheets client
    global sheets_client
    if app.config['SPREADSHEET_ID']:
        sheets_client = SheetsClient(
            credentials_file=app.config['GOOGLE_CREDENTIALS_FILE'],
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

    app.register_blueprint(dashboard_bp)
    app.register_blueprint(claims_bp, url_prefix='/claims')
    app.register_blueprint(spends_bp, url_prefix='/spends')
    app.register_blueprint(roster_bp, url_prefix='/roster')
    app.register_blueprint(periods_bp, url_prefix='/periods')
    app.register_blueprint(audit_bp, url_prefix='/audit')
    app.register_blueprint(player_bp, url_prefix='/player')

    return app
