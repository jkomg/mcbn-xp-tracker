"""Tests for staff retirement actions on the reports page."""

from pathlib import Path

from flask import Blueprint, Flask

from app.blueprints.reports import bp as reports_bp
from app.db import RetirementAutomationJob, db

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
    db.init_app(app)
    app.register_blueprint(_stub_bp('dashboard', '/', {'/': 'index', '/login': 'login', '/logout': 'logout'}))
    app.register_blueprint(_stub_bp('claims', '/claims', {'/pending': 'pending'}))
    app.register_blueprint(_stub_bp('spends', '/spends', {'/pending': 'pending'}))
    app.register_blueprint(_stub_bp('roster', '/roster', {'/': 'index'}))
    app.register_blueprint(_stub_bp('periods', '/periods', {'/': 'index'}))
    app.register_blueprint(_stub_bp('audit', '/audit', {'/': 'log', '/errors': 'errors'}))
    app.register_blueprint(_stub_bp('player', '/player', {'/': 'my_characters'}))
    app.register_blueprint(_stub_bp('wiki', '/wiki', {'/': 'index'}))
    app.register_blueprint(_stub_bp('cc_admin', '/cc-admin', {'/loresheets': 'loresheet_list', '/drafts': 'draft_list', '/drafts/<int:draft_id>': 'draft_review'}))
    app.register_blueprint(_stub_bp('coteries', '/coteries', {'/': 'index'}))
    app.register_blueprint(reports_bp)
    with app.app_context():
        db.create_all()
    return app


def _set_session(client):
    with client.session_transaction() as sess:
        sess['authenticated'] = True
        sess['discord_id'] = '12345'
        sess['discord_name'] = 'Tester'
        sess['staff_user'] = 'Tester'


def test_staff_can_mark_retirement_job_manually_resolved():
    app = _app()
    with app.app_context():
        db.session.add(RetirementAutomationJob(
            character_name='Alice Voss',
            requested_by='staff-1',
            last_error='manual cleanup required',
            attempt_count=2,
        ))
        db.session.commit()
        job_id = RetirementAutomationJob.query.one().id

    with app.test_client() as client:
        _set_session(client)
        res = client.post(f'/reports/retirement-jobs/{job_id}/resolve')
        assert res.status_code == 302

    with app.app_context():
        row = db.session.get(RetirementAutomationJob, job_id)
        assert row is not None
        assert row.discord_completed_at is not None
        assert row.wiki_synced_at is not None
        assert row.cubby_moved_at is not None
        assert row.children_moved_at is not None
        assert row.last_attempt_at is not None
        assert row.last_error == ''
