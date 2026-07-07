"""Regression tests for /reports/health: truncated-baseline delta suppression
and the not-posting table's display-name fallback."""

from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Blueprint, Flask
from flask_wtf import CSRFProtect

from app.blueprints.reports import bp as reports_bp
from app.db import DbCharacter, DiscordMemberEvent, DiscordPostCount, db

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


def _days_ago(n: int) -> str:
    return (datetime.now(timezone.utc).date() - timedelta(days=n)).isoformat()


def _date_added_days_ago(n: int) -> str:
    """DbCharacter.date_added's actual on-disk format: 'YYYYMMDD HH:MM:SS'."""
    return (datetime.now(timezone.utc) - timedelta(days=n)).strftime('%Y%m%d %H:%M:%S')


def test_delta_suppressed_when_prior_window_would_be_truncated():
    """A full 30-day current window compared against a prior 30-day window
    that's truncated (tracking only started partway through it) must not
    produce a misleading delta — the comparison should be skipped entirely
    rather than computed against a shorter baseline.

    range=30: current window is days 29..0 ago. Natural prior window is
    days 59..30 ago. Earliest tracked date at day 40 ago sits inside that
    prior window (after its start) but doesn't affect the current window at
    all (day 40 ago < day 29 ago), so only the comparison is truncated.
    """
    app = _app()
    with app.app_context():
        db.session.add(DiscordPostCount(discord_id='u1', date=_days_ago(40), category='ic', count=1))
        db.session.add(DiscordPostCount(discord_id='u1', date=_days_ago(5), category='ic', count=10))
        db.session.commit()

    with app.test_client() as client:
        _set_session(client)
        resp = client.get('/reports/health?range=30')
        assert resp.status_code == 200
        html = resp.data.decode()
        assert 'no prior baseline' in html


def test_full_prior_window_available_shows_a_real_delta():
    """Earliest tracked date (day 80 ago) sits before the natural prior
    window's start (day 59 ago), so a full same-length baseline exists and
    a real percentage delta should render."""
    app = _app()
    with app.app_context():
        db.session.add(DiscordPostCount(discord_id='u1', date=_days_ago(80), category='ic', count=1))
        db.session.add(DiscordPostCount(discord_id='u1', date=_days_ago(45), category='ic', count=5))
        db.session.add(DiscordPostCount(discord_id='u1', date=_days_ago(5), category='ic', count=20))
        db.session.commit()

    with app.test_client() as client:
        _set_session(client)
        resp = client.get('/reports/health?range=30')
        assert resp.status_code == 200
        html = resp.data.decode()
        assert 'vs prior period' in html


def test_not_posting_shows_roster_name_for_a_never_posted_active_player():
    app = _app()
    with app.app_context():
        db.session.add(DbCharacter(
            character_name='Zara', player_discord='p2', player_discord_name='ZaraPlayer', active=True,
        ))
        db.session.commit()

    with app.test_client() as client:
        _set_session(client)
        resp = client.get('/reports/health?range=30')
        assert resp.status_code == 200
        html = resp.data.decode()
        assert 'ZaraPlayer' in html


def test_new_characters_within_window_appear_and_outside_window_excluded():
    app = _app()
    with app.app_context():
        db.session.add(DbCharacter(
            character_name='Marcus', clan='Tremere', active=True,
            date_added=_date_added_days_ago(5),  # inside a 30-day window
        ))
        db.session.add(DbCharacter(
            character_name='OldTimer', clan='Ventrue', active=True,
            date_added=_date_added_days_ago(90),  # well outside a 30-day window
        ))
        db.session.commit()

    with app.test_client() as client:
        _set_session(client)
        resp = client.get('/reports/health?range=30')
        assert resp.status_code == 200
        html = resp.data.decode()
        assert 'Marcus' in html
        assert 'Tremere' in html
        assert 'OldTimer' not in html


def test_member_growth_stat_tiles_reflect_seeded_events():
    app = _app()
    with app.app_context():
        db.session.add(DiscordMemberEvent(discord_id='m1', event_type='join', role='', date=_days_ago(5)))
        db.session.add(DiscordMemberEvent(discord_id='m2', event_type='join', role='', date=_days_ago(3)))
        db.session.add(DiscordMemberEvent(discord_id='m1', event_type='role_gain', role='kindred', date=_days_ago(4)))
        db.session.commit()

    with app.test_client() as client:
        _set_session(client)
        resp = client.get('/reports/health?range=30')
        assert resp.status_code == 200
        html = resp.data.decode()
        assert 'New Members' in html
        assert 'Verified (Kindred/Ghoul/Mortal)' in html
        assert '2 Kindred' not in html  # sanity: role breakdown should read "1 Kindred", not double-count
        assert '1 Kindred' in html
