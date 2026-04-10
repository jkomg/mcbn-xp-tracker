"""Tests for POST /api/sheets/reconcile endpoint."""

import app as app_module
from flask import Flask

from app.blueprints.api import bp as api_bp
from app.db import db


def _app(sheets_sync_obj=None):
    application = Flask(__name__)
    application.config['TESTING'] = True
    application.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    application.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    application.config['WEB_APP_API_TOKEN'] = 'test-token'
    application.config['WEB_APP_API_READ_TOKEN'] = 'read-token'
    application.config['WEB_APP_API_WRITE_TOKEN'] = 'write-token'
    application.config['BOT_API_REPLAY_PROTECTION_ENABLED'] = False
    db.init_app(application)
    application.register_blueprint(api_bp, url_prefix='/api')
    with application.app_context():
        db.create_all()
        app_module.sheets_sync = sheets_sync_obj
    return application


def test_reconcile_requires_auth():
    app = _app()
    with app.test_client() as client:
        res = client.post('/api/sheets/reconcile')
        assert res.status_code == 401


def test_reconcile_requires_write_scope():
    app = _app()
    with app.test_client() as client:
        res = client.post('/api/sheets/reconcile', headers={'Authorization': 'Bearer read-token'})
        assert res.status_code == 403


def test_reconcile_returns_503_when_sheets_not_configured():
    app = _app(sheets_sync_obj=None)
    with app.test_client() as client:
        res = client.post('/api/sheets/reconcile', headers={'Authorization': 'Bearer write-token'})
        assert res.status_code == 503
        assert 'error' in res.get_json()


def test_reconcile_calls_reconcile_and_returns_summary():
    class FakeSync:
        def reconcile(self, db_svc):
            return {
                'started_at': '2026-04-10 03:00:00 UTC',
                'finished_at': '2026-04-10 03:00:01 UTC',
                'claims_appended': 1,
                'claims_status_updated': 0,
                'spends_appended': 0,
                'spends_status_updated': 0,
                'ledger_appended': 2,
                'characters_appended': 0,
                'errors': [],
            }

    app = _app(sheets_sync_obj=FakeSync())
    with app.test_client() as client:
        res = client.post('/api/sheets/reconcile', headers={'Authorization': 'Bearer write-token'})
        assert res.status_code == 200
        data = res.get_json()
        assert data['claims_appended'] == 1
        assert data['ledger_appended'] == 2
        assert data['errors'] == []
