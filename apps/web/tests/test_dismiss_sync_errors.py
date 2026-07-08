"""Tests for POST /audit/errors/sync/<id>/dismiss and /audit/errors/sync/bulk-dismiss."""

from flask import Blueprint, Flask

from app.blueprints.audit import bp as audit_bp
from app.db import DbSheetsSyncError, db

# require_staff redirects unauthenticated requests to 'dashboard.login'. See
# tests/test_sheet_import_approval.py for why a minimal stand-in is used
# instead of the real dashboard blueprint (module-level limiter.limit()).
_fake_dashboard_bp = Blueprint('dashboard', __name__)


@_fake_dashboard_bp.route('/login')
def login():
    return 'login', 200


def _app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = 'test'
    db.init_app(app)
    app.register_blueprint(audit_bp, url_prefix='/audit')
    app.register_blueprint(_fake_dashboard_bp)
    with app.app_context():
        db.create_all()
    return app


def _staff_client(app):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['authenticated'] = True
    return client


def _seed(app, n):
    with app.app_context():
        ids = []
        for i in range(n):
            entry = DbSheetsSyncError(timestamp='x', operation=f'op{i}', error='boom', details='')
            db.session.add(entry)
            db.session.flush()
            ids.append(entry.id)
        db.session.commit()
        return ids


def test_dismiss_single_requires_staff():
    app = _app()
    with app.test_client() as client:
        res = client.post('/audit/errors/sync/1/dismiss')
    assert res.status_code == 302


def test_dismiss_single_marks_dismissed():
    app = _app()
    ids = _seed(app, 1)
    client = _staff_client(app)
    res = client.post(f'/audit/errors/sync/{ids[0]}/dismiss')
    assert res.status_code == 200
    assert res.get_json() == {'ok': True}
    with app.app_context():
        assert db.session.get(DbSheetsSyncError, ids[0]).dismissed is True


def test_dismiss_single_404s_for_unknown_id():
    app = _app()
    client = _staff_client(app)
    res = client.post('/audit/errors/sync/99999/dismiss')
    assert res.status_code == 404


def test_bulk_dismiss_requires_staff():
    app = _app()
    with app.test_client() as client:
        res = client.post('/audit/errors/sync/bulk-dismiss', json={'ids': [1]})
    assert res.status_code == 302


def test_bulk_dismisses_only_the_given_ids():
    app = _app()
    ids = _seed(app, 3)
    client = _staff_client(app)
    res = client.post('/audit/errors/sync/bulk-dismiss', json={'ids': [ids[0], ids[1]]})
    assert res.status_code == 200
    assert res.get_json() == {'ok': True, 'count': 2}
    with app.app_context():
        assert db.session.get(DbSheetsSyncError, ids[0]).dismissed is True
        assert db.session.get(DbSheetsSyncError, ids[1]).dismissed is True
        assert db.session.get(DbSheetsSyncError, ids[2]).dismissed is False


def test_bulk_rejects_empty_ids():
    app = _app()
    client = _staff_client(app)
    res = client.post('/audit/errors/sync/bulk-dismiss', json={'ids': []})
    assert res.status_code == 400


def test_bulk_rejects_missing_ids():
    app = _app()
    client = _staff_client(app)
    res = client.post('/audit/errors/sync/bulk-dismiss', json={})
    assert res.status_code == 400


def test_bulk_rejects_non_integer_ids():
    app = _app()
    client = _staff_client(app)
    res = client.post('/audit/errors/sync/bulk-dismiss', json={'ids': ['not-a-number']})
    assert res.status_code == 400
