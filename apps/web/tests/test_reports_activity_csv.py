"""Regression test for /reports/activity.csv -- covers the column-only
query refactor (was previously DiscordPostCount.query.all(), materializing
full ORM instances; switched to db.session.query(col, col, ...) to reduce
memory on this table now that it holds 300k+ backfilled rows)."""

from pathlib import Path

from flask import Blueprint, Flask
from flask_wtf import CSRFProtect

from app.blueprints.reports import bp as reports_bp
from app.db import DiscordDisplayName, DiscordPostCount, db

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
    CSRFProtect(app)
    db.init_app(app)
    app.register_blueprint(_stub_bp('dashboard', '/', {
        '/': 'index', '/login': 'login', '/logout': 'logout', '/view-as/clear': 'clear_view_as',
    }))
    app.register_blueprint(_stub_bp('claims', '/claims', {'/pending': 'pending'}))
    app.register_blueprint(_stub_bp('spends', '/spends', {'/pending': 'pending'}))
    app.register_blueprint(_stub_bp('roster', '/roster', {'/': 'index', '/characters': 'list_characters'}))
    app.register_blueprint(_stub_bp('periods', '/periods', {'/': 'index', '/list': 'list_periods'}))
    app.register_blueprint(_stub_bp('audit', '/audit', {'/': 'log', '/errors': 'errors'}))
    app.register_blueprint(_stub_bp('player', '/player', {'/': 'my_characters'}))
    app.register_blueprint(_stub_bp('wiki', '/wiki', {'/': 'index'}))
    app.register_blueprint(_stub_bp('cc_admin', '/cc-admin', {
        '/loresheets': 'loresheet_list', '/drafts': 'draft_list', '/drafts/<int:draft_id>': 'draft_review',
        '/sheet-imports': 'sheet_import_list',
    }))
    app.register_blueprint(_stub_bp('coteries', '/coteries', {'/': 'index'}))
    app.register_blueprint(_stub_bp('settings', '/settings', {'/': 'index'}))
    app.register_blueprint(_stub_bp('local_status', '/local/status', {'/': 'status_page'}))
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


def test_csv_pivots_multiple_categories_per_user_per_day_and_resolves_display_name():
    app = _app()
    with app.app_context():
        db.session.add(DiscordPostCount(discord_id='u1', date='2026-06-01', category='ic', count=3))
        db.session.add(DiscordPostCount(discord_id='u1', date='2026-06-01', category='ooc', count=2))
        db.session.add(DiscordPostCount(discord_id='u2', date='2026-06-02', category='cubby', count=1))
        db.session.add(DiscordDisplayName(discord_id='u1', display_name='Alice'))
        db.session.commit()

    with app.test_client() as client:
        _set_session(client)
        resp = client.get('/reports/activity.csv')
        assert resp.status_code == 200
        assert resp.mimetype == 'text/csv'
        body = resp.data.decode()
        lines = body.strip().splitlines()
        assert lines[0] == 'date,discord_id,display_name,ic,ooc,rolls,cubby,total'
        assert '2026-06-01,u1,Alice,3,2,0,0,5' in lines
        assert '2026-06-02,u2,,0,0,0,1,1' in lines


def test_csv_respects_since_and_until_bounds():
    app = _app()
    with app.app_context():
        db.session.add(DiscordPostCount(discord_id='u1', date='2026-05-01', category='ic', count=1))
        db.session.add(DiscordPostCount(discord_id='u1', date='2026-06-15', category='ic', count=2))
        db.session.add(DiscordPostCount(discord_id='u1', date='2026-07-01', category='ic', count=4))
        db.session.commit()

    with app.test_client() as client:
        _set_session(client)
        resp = client.get('/reports/activity.csv?since=2026-06-01&until=2026-06-30')
        body = resp.data.decode()
        assert '2026-05-01' not in body
        assert '2026-06-15' in body
        assert '2026-07-01' not in body
