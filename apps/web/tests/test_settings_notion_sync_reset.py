"""Tests for settings-side Notion sync reset controls."""

from datetime import timedelta

from flask import Flask

from app.blueprints.settings import bp as settings_bp
from app.db import AppSetting, db


def _app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.secret_key = 'test-secret'
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SETTINGS_ADMIN_DISCORD_IDS'] = {'12345'}
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=12)
    db.init_app(app)
    app.register_blueprint(settings_bp, url_prefix='/settings')
    with app.app_context():
        db.create_all()
    return app


def _seed_sync_records(app: Flask):
    with app.app_context():
        for key, value in (
            ('BOT_NOTION_SYNC_REQUESTED', 'true'),
            ('BOT_NOTION_SYNC_STATUS', 'running'),
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
