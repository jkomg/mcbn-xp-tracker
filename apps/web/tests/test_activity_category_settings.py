"""Tests for the IC/OOC/Rolls activity-tracking category ID settings.

Mirrors the existing BOT_CC_TICKET_CATEGORY_IDS pattern: DB-editable via
Settings, exposed to the bot through /api/bot-config, applied within ~1
minute via the bot's ConfigSyncWorker (no restart needed).
"""

from datetime import timedelta
from pathlib import Path

import pytest
from flask import Blueprint, Flask

import app as app_module
from app.app_settings import EDITABLE_KEYS
from app.blueprints.api import bp as api_bp
import app.blueprints.api as api_module
from app.blueprints.settings import bp as settings_bp
from app.db import AppSetting, db
from app.db_service import DBService

_TEMPLATE_DIR = str(Path(__file__).resolve().parents[1] / 'app' / 'templates')
_STATIC_DIR = str(Path(__file__).resolve().parents[1] / 'app' / 'static')

_ACTIVITY_KEYS = (
    'BOT_ACTIVITY_IC_CATEGORY_IDS',
    'BOT_ACTIVITY_OOC_CATEGORY_IDS',
    'BOT_ACTIVITY_ROLLS_CATEGORY_IDS',
)


# ── /api/bot-config ──────────────────────────────────────────────────────────

@pytest.fixture()
def api_app_ctx():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['WEB_APP_API_TOKEN'] = 'legacy-token'
    app.config['WEB_APP_API_READ_TOKEN'] = 'read-token'
    app.config['WEB_APP_API_WRITE_TOKEN'] = 'write-token'
    app.config['BOT_API_REPLAY_PROTECTION_ENABLED'] = True
    app.config['BOT_API_REPLAY_WINDOW_SECONDS'] = 300
    app.config['BOT_API_NONCE_TTL_SECONDS'] = 600
    app.config['BOT_API_NONCE_CACHE_SIZE'] = 1000
    app.config['ALLOWED_DISCORD_IDS'] = {'999999999999999999'}
    db.init_app(app)
    app.register_blueprint(api_bp, url_prefix='/api')
    with app.app_context():
        db.create_all()
        app_module.db_service = DBService()
        api_module.db_service = app_module.db_service
        yield app


def _read_headers(token='read-token'):
    return {'Authorization': f'Bearer {token}'}


def test_bot_config_activity_category_ids_default_to_null(api_app_ctx):
    with api_app_ctx.test_client() as client:
        res = client.get('/api/bot-config', headers=_read_headers())
        assert res.status_code == 200
        body = res.get_json()
        assert body['activityIcCategoryIds'] is None
        assert body['activityOocCategoryIds'] is None
        assert body['activityRollsCategoryIds'] is None


def test_bot_config_returns_db_override_for_activity_category_ids(api_app_ctx):
    with api_app_ctx.app_context():
        db.session.add(AppSetting(key='BOT_ACTIVITY_IC_CATEGORY_IDS', value='111,222'))
        db.session.add(AppSetting(key='BOT_ACTIVITY_OOC_CATEGORY_IDS', value='333'))
        db.session.add(AppSetting(key='BOT_ACTIVITY_ROLLS_CATEGORY_IDS', value='444'))
        db.session.commit()

    with api_app_ctx.test_client() as client:
        res = client.get('/api/bot-config', headers=_read_headers())
        assert res.status_code == 200
        body = res.get_json()
        assert body['activityIcCategoryIds'] == '111,222'
        assert body['activityOocCategoryIds'] == '333'
        assert body['activityRollsCategoryIds'] == '444'


# ── EDITABLE_KEYS ─────────────────────────────────────────────────────────────

def test_activity_category_keys_are_editable():
    for key in _ACTIVITY_KEYS:
        assert key in EDITABLE_KEYS


# ── /settings/update ──────────────────────────────────────────────────────────

def _stub_bp(name: str, prefix: str, routes: dict[str, str]) -> Blueprint:
    bp = Blueprint(name, __name__, url_prefix=prefix)
    for rule, fn_name in routes.items():
        bp.add_url_rule(rule, fn_name, lambda **_: ('', 200))
    return bp


def _settings_app():
    app = Flask(__name__, template_folder=_TEMPLATE_DIR, static_folder=_STATIC_DIR)
    app.config['TESTING'] = True
    app.secret_key = 'test-secret'
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SETTINGS_ADMIN_DISCORD_IDS'] = {'12345'}
    app.config['CLOUD_SPEND_ADMIN_DISCORD_IDS'] = set()
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=12)
    app.jinja_env.globals['csrf_token'] = lambda: 'test-csrf'
    db.init_app(app)
    app.register_blueprint(_stub_bp('dashboard', '/', {'/': 'index', '/login': 'login', '/logout': 'logout'}))
    app.register_blueprint(_stub_bp('claims', '/claims', {'/pending': 'pending'}))
    app.register_blueprint(_stub_bp('spends', '/spends', {'/pending': 'pending'}))
    app.register_blueprint(_stub_bp('roster', '/roster', {'/': 'list_characters'}))
    app.register_blueprint(_stub_bp('periods', '/periods', {'/': 'list_periods'}))
    app.register_blueprint(_stub_bp('audit', '/audit', {'/': 'log', '/errors': 'errors'}))
    app.register_blueprint(_stub_bp('player', '/player', {'/': 'my_characters'}))
    app.register_blueprint(_stub_bp('wiki', '/wiki', {'/': 'index'}))
    app.register_blueprint(_stub_bp('cc_admin', '/cc-admin', {'/loresheets': 'loresheet_list', '/drafts': 'draft_list', '/drafts/<int:draft_id>': 'draft_review'}))
    app.register_blueprint(_stub_bp('coteries', '/coteries', {'/': 'index'}))
    app.register_blueprint(settings_bp, url_prefix='/settings')
    with app.app_context():
        db.create_all()
    return app


def _set_session(client, discord_id: str):
    with client.session_transaction() as sess:
        sess['authenticated'] = True
        sess['discord_id'] = discord_id
        sess['discord_name'] = 'Tester'
        sess['staff_user'] = 'Tester'


@pytest.mark.parametrize('key', _ACTIVITY_KEYS)
def test_settings_update_saves_activity_category_ids_as_raw_string(key):
    app = _settings_app()
    with app.test_client() as client:
        _set_session(client, '12345')
        res = client.post(
            '/settings/update',
            data={'key': key, 'value': '123456789012345678, 987654321098765432', 'action': 'update', 'section': 'bot-channels'},
        )
        assert res.status_code in (302, 303)

    with app.app_context():
        record = db.session.get(AppSetting, key)
        assert record is not None
        # Stored as a raw comma-separated string — not coerced to bool/int.
        assert record.value == '123456789012345678, 987654321098765432'


@pytest.mark.parametrize('key', _ACTIVITY_KEYS)
def test_settings_update_reset_clears_activity_category_override(key):
    app = _settings_app()
    with app.app_context():
        db.session.add(AppSetting(key=key, value='111,222'))
        db.session.commit()

    with app.test_client() as client:
        _set_session(client, '12345')
        res = client.post(
            '/settings/update',
            data={'key': key, 'action': 'reset', 'section': 'bot-channels'},
        )
        assert res.status_code in (302, 303)

    with app.app_context():
        assert db.session.get(AppSetting, key) is None


def test_settings_update_denied_for_non_admin():
    app = _settings_app()
    with app.test_client() as client:
        _set_session(client, 'not-an-admin')
        res = client.post(
            '/settings/update',
            data={'key': 'BOT_ACTIVITY_IC_CATEGORY_IDS', 'value': '111', 'action': 'update', 'section': 'bot-channels'},
        )
        assert res.status_code in (302, 303, 403)

    with app.app_context():
        assert db.session.get(AppSetting, 'BOT_ACTIVITY_IC_CATEGORY_IDS') is None
