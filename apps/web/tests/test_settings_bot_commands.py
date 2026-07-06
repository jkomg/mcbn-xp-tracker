"""Tests for the per-command/subcommand kill-switch toggles on the Settings page."""

from datetime import timedelta
from pathlib import Path

from flask import Blueprint, Flask

from app.blueprints.settings import bp as settings_bp
from app.db import AppSetting, db

_TEMPLATE_DIR = str(Path(__file__).resolve().parents[1] / 'app' / 'templates')
_STATIC_DIR = str(Path(__file__).resolve().parents[1] / 'app' / 'static')


def _stub_bp(name: str, prefix: str, routes: dict[str, str]) -> Blueprint:
    bp = Blueprint(name, __name__, url_prefix=prefix)
    for rule, fn_name in routes.items():
        bp.add_url_rule(rule, fn_name, lambda **_: ('', 200))
    return bp


def _app():
    app = Flask(__name__, template_folder=_TEMPLATE_DIR, static_folder=_STATIC_DIR)
    app.config['TESTING'] = True
    app.secret_key = 'test-secret'
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SETTINGS_ADMIN_DISCORD_IDS'] = {'12345'}
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


def _disabled_value(app: Flask) -> str:
    with app.app_context():
        record = db.session.get(AppSetting, 'BOT_DISABLED_COMMANDS')
        return record.value if record else ''


def test_disable_subcommand_adds_token_for_admin():
    app = _app()
    with app.test_client() as client:
        _set_session(client, '12345')
        res = client.post('/settings/commands/toggle', data={'token': 'xp.submit', 'action': 'disable'})
        assert res.status_code == 302

    assert _disabled_value(app) == 'xp.submit'


def test_enable_removes_token():
    app = _app()
    with app.app_context():
        db.session.merge(AppSetting(key='BOT_DISABLED_COMMANDS', value='xp.submit,cobweb', updated_by='test'))
        db.session.commit()

    with app.test_client() as client:
        _set_session(client, '12345')
        res = client.post('/settings/commands/toggle', data={'token': 'xp.submit', 'action': 'enable'})
        assert res.status_code == 302

    assert _disabled_value(app) == 'cobweb'


def test_disable_whole_command_token():
    app = _app()
    with app.test_client() as client:
        _set_session(client, '12345')
        res = client.post('/settings/commands/toggle', data={'token': 'lasombra', 'action': 'disable'})
        assert res.status_code == 302

    assert _disabled_value(app) == 'lasombra'


def test_unknown_token_is_rejected():
    app = _app()
    with app.test_client() as client:
        _set_session(client, '12345')
        res = client.post('/settings/commands/toggle', data={'token': 'not-a-real-command', 'action': 'disable'})
        assert res.status_code == 302

    assert _disabled_value(app) == ''


def test_denied_for_non_admin():
    app = _app()
    with app.test_client() as client:
        _set_session(client, '99999')
        res = client.post('/settings/commands/toggle', data={'token': 'xp.submit', 'action': 'disable'})
        assert res.status_code == 302

    assert _disabled_value(app) == ''


def test_settings_index_renders_bot_commands_section():
    app = _app()
    with app.app_context():
        db.session.merge(AppSetting(key='BOT_DISABLED_COMMANDS', value='xp.submit', updated_by='test'))
        db.session.commit()

    with app.test_client() as client:
        _set_session(client, '12345')
        res = client.get('/settings/')
        assert res.status_code == 200
        body = res.get_data(as_text=True)
        assert 'Bot — Commands' in body
        assert '/xp' in body
        assert 'submit' in body
