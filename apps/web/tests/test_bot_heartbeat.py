"""Tests for POST/GET /api/bot-heartbeat endpoints."""

from flask import Flask

from app.blueprints.api import bp as api_bp
from app.db import AppSetting, db


def _app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['WEB_APP_API_TOKEN'] = 'test-token'
    app.config['WEB_APP_API_READ_TOKEN'] = 'read-token'
    app.config['WEB_APP_API_WRITE_TOKEN'] = 'write-token'
    app.config['BOT_API_REPLAY_PROTECTION_ENABLED'] = False
    db.init_app(app)
    app.register_blueprint(api_bp, url_prefix='/api')
    with app.app_context():
        db.create_all()
    return app


def test_heartbeat_post_stores_timestamp():
    app = _app()
    with app.test_client() as client:
        res = client.post('/api/bot-heartbeat', headers={'Authorization': 'Bearer test-token'})
        assert res.status_code == 200
        assert res.get_json()['ok'] is True


def test_heartbeat_get_returns_age_after_post():
    app = _app()
    with app.test_client() as client:
        client.post('/api/bot-heartbeat', headers={'Authorization': 'Bearer test-token'})
        res = client.get('/api/bot-heartbeat', headers={'Authorization': 'Bearer read-token'})
        assert res.status_code == 200
        data = res.get_json()
        assert data['last_heartbeat'] is not None
        assert isinstance(data['age_seconds'], int)
        assert data['age_seconds'] >= 0


def test_heartbeat_get_returns_none_before_any_post():
    app = _app()
    with app.test_client() as client:
        res = client.get('/api/bot-heartbeat', headers={'Authorization': 'Bearer read-token'})
        assert res.status_code == 200
        data = res.get_json()
        assert data['last_heartbeat'] is None
        assert data['age_seconds'] is None


def test_heartbeat_post_requires_auth():
    app = _app()
    with app.test_client() as client:
        res = client.post('/api/bot-heartbeat')
        assert res.status_code == 401


def test_heartbeat_get_requires_auth():
    app = _app()
    with app.test_client() as client:
        res = client.get('/api/bot-heartbeat')
        assert res.status_code == 401


def test_heartbeat_post_persists_notion_sync_capability_flag():
    app = _app()
    with app.test_client() as client:
        res = client.post(
            '/api/bot-heartbeat',
            headers={'Authorization': 'Bearer test-token'},
            json={'notionSyncCapable': False},
        )
        assert res.status_code == 200

    with app.app_context():
        rec = AppSetting.query.get('BOT_LIVE_NOTION_SYNC_CAPABLE')
        assert rec is not None
        assert rec.value == 'false'
