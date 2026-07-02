"""Tests for POST /audit/errors/bulk-dismiss."""

from flask import Blueprint, Flask

from app.blueprints.audit import bp as audit_bp
from app.db import AppLogEntry, db

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
            entry = AppLogEntry(ts='x', source='bot', level='error', event=f'e{i}', message='x')
            db.session.add(entry)
            db.session.flush()
            ids.append(entry.id)
        db.session.commit()
        return ids


def test_requires_staff():
    app = _app()
    with app.test_client() as client:
        res = client.post('/audit/errors/bulk-dismiss', json={'ids': [1]})
    assert res.status_code == 302


def test_dismisses_only_the_given_ids():
    app = _app()
    ids = _seed(app, 3)
    client = _staff_client(app)
    res = client.post('/audit/errors/bulk-dismiss', json={'ids': [ids[0], ids[1]]})
    assert res.status_code == 200
    assert res.get_json() == {'ok': True, 'count': 2}
    with app.app_context():
        assert db.session.get(AppLogEntry, ids[0]).dismissed is True
        assert db.session.get(AppLogEntry, ids[1]).dismissed is True
        assert db.session.get(AppLogEntry, ids[2]).dismissed is False


def test_rejects_empty_ids():
    app = _app()
    client = _staff_client(app)
    res = client.post('/audit/errors/bulk-dismiss', json={'ids': []})
    assert res.status_code == 400


def test_rejects_missing_ids():
    app = _app()
    client = _staff_client(app)
    res = client.post('/audit/errors/bulk-dismiss', json={})
    assert res.status_code == 400


def test_rejects_non_integer_ids():
    app = _app()
    client = _staff_client(app)
    res = client.post('/audit/errors/bulk-dismiss', json={'ids': ['not-a-number']})
    assert res.status_code == 400
