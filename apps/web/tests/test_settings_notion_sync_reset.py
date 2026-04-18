"""Tests for settings-side Notion sync reset controls."""

from datetime import datetime, timedelta
from pathlib import Path

from flask import Blueprint, Flask

from app.blueprints.settings import bp as settings_bp
from app.db import AppSetting, NotionSyncEvent, db

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
    app.register_blueprint(settings_bp, url_prefix='/settings')
    with app.app_context():
        db.create_all()
    return app


def _seed_sync_records(app: Flask):
    with app.app_context():
        for key, value in (
            ('BOT_NOTION_SYNC_REQUESTED', 'true'),
            ('BOT_NOTION_SYNC_STATUS', 'running'),
            ('BOT_NOTION_SYNC_RUN_ID', 'run-abc'),
            ('BOT_NOTION_SYNC_STARTED_AT', '2026-04-17T00:00:00+00:00'),
            ('BOT_NOTION_SYNC_FINISHED_AT', '2026-04-17T00:10:00+00:00'),
            ('BOT_NOTION_SYNC_ERROR', 'boom'),
            ('BOT_NOTION_SYNC_SOURCE', 'manual'),
        ):
            db.session.merge(AppSetting(key=key, value=value, updated_by='test'))
        db.session.commit()


def _set_session(client, discord_id: str):
    with client.session_transaction() as sess:
        sess['authenticated'] = True
        sess['discord_id'] = discord_id
        sess['discord_name'] = 'Tester'
        sess['staff_user'] = 'Tester'


def test_reset_notion_sync_clears_sync_state_for_admin():
    app = _app()
    _seed_sync_records(app)
    with app.test_client() as client:
        _set_session(client, '12345')
        res = client.post('/settings/reset-notion-sync')
        assert res.status_code == 302

    with app.app_context():
        for key in (
            'BOT_NOTION_SYNC_REQUESTED',
            'BOT_NOTION_SYNC_STATUS',
            'BOT_NOTION_SYNC_RUN_ID',
            'BOT_NOTION_SYNC_STARTED_AT',
            'BOT_NOTION_SYNC_FINISHED_AT',
            'BOT_NOTION_SYNC_ERROR',
            'BOT_NOTION_SYNC_SOURCE',
        ):
            assert AppSetting.query.get(key) is None


def test_reset_notion_sync_denied_for_non_admin():
    app = _app()
    _seed_sync_records(app)
    with app.test_client() as client:
        _set_session(client, '99999')
        res = client.post('/settings/reset-notion-sync')
        assert res.status_code == 302

    with app.app_context():
        assert AppSetting.query.get('BOT_NOTION_SYNC_STATUS') is not None


def test_settings_index_shows_sync_run_summary_rows():
    app = _app()
    with app.app_context():
        db.session.add(
            NotionSyncEvent(
                ts='2026-04-17T00:00:00+00:00',
                run_id='run-111',
                source='manual',
                status='running',
                error='',
                created_at=datetime.fromisoformat('2026-04-17T00:00:00+00:00'),
            )
        )
        db.session.add(
            NotionSyncEvent(
                ts='2026-04-17T00:10:00+00:00',
                run_id='run-111',
                source='manual',
                status='success',
                error='',
                created_at=datetime.fromisoformat('2026-04-17T00:10:00+00:00'),
            )
        )
        db.session.add(
            NotionSyncEvent(
                ts='2026-04-17T01:00:00+00:00',
                run_id='run-222',
                source='scheduled',
                status='error',
                error='sync failed',
                created_at=datetime.fromisoformat('2026-04-17T01:00:00+00:00'),
            )
        )
        db.session.commit()

    with app.test_client() as client:
        _set_session(client, '12345')
        res = client.get('/settings/')
        assert res.status_code == 200
        body = res.get_data(as_text=True)
        assert 'Recent sync runs' in body
        assert 'run-111' in body
        assert 'run-222' in body
        assert '10m 0s' in body
        assert 'sync failed' in body


def test_request_notion_sync_denied_when_bot_reports_missing_prereqs():
    app = _app()
    with app.app_context():
        db.session.merge(AppSetting(key='BOT_LIVE_NOTION_SYNC_CAPABLE', value='false', updated_by='bot'))
        db.session.commit()

    with app.test_client() as client:
        _set_session(client, '12345')
        res = client.post('/settings/request-notion-sync')
        assert res.status_code == 302

    with app.app_context():
        assert AppSetting.query.get('BOT_NOTION_SYNC_REQUESTED') is None


def test_request_notion_sync_allowed_when_bot_reports_capable():
    app = _app()
    with app.app_context():
        db.session.merge(AppSetting(key='BOT_LIVE_NOTION_SYNC_CAPABLE', value='true', updated_by='bot'))
        db.session.commit()

    with app.test_client() as client:
        _set_session(client, '12345')
        res = client.post('/settings/request-notion-sync')
        assert res.status_code == 302

    with app.app_context():
        requested = AppSetting.query.get('BOT_NOTION_SYNC_REQUESTED')
        assert requested is not None
        assert requested.value == 'true'
