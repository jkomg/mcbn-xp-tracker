"""Tests for POST /api/notion-sync-ack source-aware behavior."""

from flask import Flask

from app.blueprints.api import bp as api_bp
from app.db import AppSetting, NotionSyncEvent, db


def _app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['WEB_APP_API_TOKEN'] = 'legacy-token'
    app.config['WEB_APP_API_READ_TOKEN'] = 'read-token'
    app.config['WEB_APP_API_WRITE_TOKEN'] = 'write-token'
    app.config['BOT_API_REPLAY_PROTECTION_ENABLED'] = False
    db.init_app(app)
    app.register_blueprint(api_bp, url_prefix='/api')
    with app.app_context():
        db.create_all()
    return app


def _seed_setting(app: Flask, key: str, value: str):
    with app.app_context():
        db.session.merge(AppSetting(key=key, value=value, updated_by='test'))
        db.session.commit()


def test_running_ack_manual_clears_request_flag():
    app = _app()
    _seed_setting(app, 'BOT_NOTION_SYNC_REQUESTED', 'true')
    with app.test_client() as client:
        res = client.post(
            '/api/notion-sync-ack',
            headers={'Authorization': 'Bearer write-token'},
            json={'status': 'running', 'source': 'manual', 'runId': 'run-manual-1'},
        )
        assert res.status_code == 200

    with app.app_context():
        assert db.session.get(AppSetting, 'BOT_NOTION_SYNC_REQUESTED') is None
        assert db.session.get(AppSetting, 'BOT_NOTION_SYNC_STATUS').value == 'running'
        assert db.session.get(AppSetting, 'BOT_NOTION_SYNC_SOURCE').value == 'manual'
        assert db.session.get(AppSetting, 'BOT_NOTION_SYNC_RUN_ID').value == 'run-manual-1'
        event = NotionSyncEvent.query.order_by(NotionSyncEvent.id.desc()).first()
        assert event is not None
        assert event.status == 'running'
        assert event.source == 'manual'
        assert event.run_id == 'run-manual-1'
        assert event.error == ''


def test_running_ack_scheduled_does_not_clear_request_flag():
    app = _app()
    _seed_setting(app, 'BOT_NOTION_SYNC_REQUESTED', 'true')
    with app.test_client() as client:
        res = client.post(
            '/api/notion-sync-ack',
            headers={'Authorization': 'Bearer write-token'},
            json={'status': 'running', 'source': 'scheduled'},
        )
        assert res.status_code == 200

    with app.app_context():
        assert db.session.get(AppSetting, 'BOT_NOTION_SYNC_REQUESTED') is not None
        assert db.session.get(AppSetting, 'BOT_NOTION_SYNC_SOURCE').value == 'scheduled'
        assert db.session.get(AppSetting, 'BOT_NOTION_SYNC_RUN_ID') is None
        event = NotionSyncEvent.query.order_by(NotionSyncEvent.id.desc()).first()
        assert event is not None
        assert event.source == 'scheduled'
        assert event.run_id == ''


def test_running_ack_defaults_source_to_manual():
    app = _app()
    _seed_setting(app, 'BOT_NOTION_SYNC_REQUESTED', 'true')
    with app.test_client() as client:
        res = client.post(
            '/api/notion-sync-ack',
            headers={'Authorization': 'Bearer write-token'},
            json={'status': 'running'},
        )
        assert res.status_code == 200

    with app.app_context():
        assert db.session.get(AppSetting, 'BOT_NOTION_SYNC_REQUESTED') is None
        assert db.session.get(AppSetting, 'BOT_NOTION_SYNC_SOURCE').value == 'manual'
        assert db.session.get(AppSetting, 'BOT_NOTION_SYNC_RUN_ID') is None
        event = NotionSyncEvent.query.order_by(NotionSyncEvent.id.desc()).first()
        assert event is not None
        assert event.source == 'manual'
        assert event.run_id == ''


def test_ack_rejects_invalid_source():
    app = _app()
    with app.test_client() as client:
        res = client.post(
            '/api/notion-sync-ack',
            headers={'Authorization': 'Bearer write-token'},
            json={'status': 'running', 'source': 'cron'},
        )
        assert res.status_code == 400
        assert 'source must be manual or scheduled' in res.get_json()['error']


def test_ack_rejects_oversized_run_id():
    app = _app()
    with app.test_client() as client:
        res = client.post(
            '/api/notion-sync-ack',
            headers={'Authorization': 'Bearer write-token'},
            json={'status': 'running', 'source': 'manual', 'runId': 'x' * 65},
        )
        assert res.status_code == 400
        assert 'runId must be at most 64 characters' in res.get_json()['error']


def test_error_ack_persists_event_error_message():
    app = _app()
    with app.test_client() as client:
        res = client.post(
            '/api/notion-sync-ack',
            headers={'Authorization': 'Bearer write-token'},
            json={'status': 'error', 'source': 'scheduled', 'runId': 'run-scheduled-9', 'error': 'sync exploded'},
        )
        assert res.status_code == 200

    with app.app_context():
        event = NotionSyncEvent.query.order_by(NotionSyncEvent.id.desc()).first()
        assert event is not None
        assert event.status == 'error'
        assert event.source == 'scheduled'
        assert event.run_id == 'run-scheduled-9'
        assert event.error == 'sync exploded'
