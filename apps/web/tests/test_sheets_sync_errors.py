"""Tests for sheets sync error log DB methods."""

from flask import Flask

from app.db import db
from app.db_service import DBService


def _app():
    application = Flask(__name__)
    application.config['TESTING'] = True
    application.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    application.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(application)
    with application.app_context():
        db.create_all()
    return application


def test_log_and_retrieve_sync_error():
    app = _app()
    svc = DBService(sheets_client=None)
    with app.app_context():
        svc.log_sheets_sync_error('submit_xp_claim', 'connection refused', details='')
        errors = svc.get_recent_sync_errors(limit=10)
    assert len(errors) == 1
    assert errors[0]['operation'] == 'submit_xp_claim'
    assert errors[0]['error'] == 'connection refused'


def test_get_recent_sync_errors_returns_newest_first():
    app = _app()
    svc = DBService(sheets_client=None)
    with app.app_context():
        svc.log_sheets_sync_error('op_a', 'err_a')
        svc.log_sheets_sync_error('op_b', 'err_b')
        errors = svc.get_recent_sync_errors(limit=10)
    assert errors[0]['operation'] == 'op_b'
    assert errors[1]['operation'] == 'op_a'


def test_get_recent_sync_errors_respects_limit():
    app = _app()
    svc = DBService(sheets_client=None)
    with app.app_context():
        for i in range(5):
            svc.log_sheets_sync_error('op', f'err {i}')
        errors = svc.get_recent_sync_errors(limit=3)
    assert len(errors) == 3


def test_log_sync_error_with_details():
    app = _app()
    svc = DBService(sheets_client=None)
    with app.app_context():
        svc.log_sheets_sync_error('reconcile', 'ok', details='{"claims_appended": 1}')
        errors = svc.get_recent_sync_errors()
    assert errors[0]['details'] == '{"claims_appended": 1}'
