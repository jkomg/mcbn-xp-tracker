"""Tests for GET /api/cc/eligibility (ancilla eligibility check).

Regression: a prior version string-compared DbCharacter.date_added directly
against a '%Y-%m-%d' cutoff string. date_added has two real formats —
'YYYYMMDD HH:MM:SS' from every live approval, 'YYYY-MM-DD' from the one-time
CSV migration — and they don't sort consistently as raw strings. For any
character approved this calendar year (i.e. virtually every live-approved
character), the string comparison silently evaluated false regardless of
actual age, permanently blocking ancilla eligibility.
"""

from datetime import datetime, timedelta, timezone

from flask import Blueprint, Flask

from app.blueprints.character_creator import bp as cc_bp
from app.db import DbCharacter, db

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
    app.register_blueprint(cc_bp)
    app.register_blueprint(_fake_dashboard_bp)
    with app.app_context():
        db.create_all()
    return app


def _player_client(app, discord_id='111'):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['discord_id'] = discord_id
    return client


def _live_format_days_ago(n: int) -> str:
    """The on-disk format every live approval actually uses: 'YYYYMMDD HH:MM:SS'."""
    return (datetime.now(timezone.utc) - timedelta(days=n)).strftime('%Y%m%d %H:%M:%S')


def _migrated_format_days_ago(n: int) -> str:
    """The other on-disk format, from the one-time CSV migration: 'YYYY-MM-DD'."""
    return (datetime.now(timezone.utc) - timedelta(days=n)).strftime('%Y-%m-%d')


def _add_character(discord_id, date_added, active=True, name='Test Character'):
    db.session.add(DbCharacter(
        character_name=name, player_discord=discord_id, active=active, date_added=date_added,
    ))
    db.session.commit()


def test_eligible_with_live_format_date_over_60_days_old():
    """This is the exact bug: a live-approved character 90 days old must be eligible."""
    app = _app()
    with app.app_context():
        _add_character('111', _live_format_days_ago(90))

    client = _player_client(app)
    resp = client.get('/api/cc/eligibility')
    assert resp.status_code == 200
    assert resp.get_json()['eligible'] is True


def test_ineligible_with_live_format_date_under_60_days_old():
    app = _app()
    with app.app_context():
        _add_character('111', _live_format_days_ago(30))

    client = _player_client(app)
    resp = client.get('/api/cc/eligibility')
    assert resp.get_json()['eligible'] is False


def test_eligible_with_migrated_format_date_over_60_days_old():
    app = _app()
    with app.app_context():
        _add_character('111', _migrated_format_days_ago(90))

    client = _player_client(app)
    resp = client.get('/api/cc/eligibility')
    assert resp.get_json()['eligible'] is True


def test_ineligible_with_no_characters():
    app = _app()
    client = _player_client(app)
    resp = client.get('/api/cc/eligibility')
    assert resp.get_json()['eligible'] is False
    assert resp.get_json()['earliest_approved_at'] is None


def test_inactive_character_does_not_count():
    app = _app()
    with app.app_context():
        _add_character('111', _live_format_days_ago(90), active=False)

    client = _player_client(app)
    resp = client.get('/api/cc/eligibility')
    assert resp.get_json()['eligible'] is False


def test_other_players_character_does_not_count():
    app = _app()
    with app.app_context():
        _add_character('222', _live_format_days_ago(90))

    client = _player_client(app, discord_id='111')
    resp = client.get('/api/cc/eligibility')
    assert resp.get_json()['eligible'] is False


def test_earliest_approved_at_picks_oldest_across_mixed_formats():
    app = _app()
    with app.app_context():
        _add_character('111', _live_format_days_ago(70), name='Newer')
        _add_character('111', _migrated_format_days_ago(200), name='Older')

    client = _player_client(app)
    resp = client.get('/api/cc/eligibility')
    data = resp.get_json()
    assert data['eligible'] is True
    assert data['earliest_approved_at'] == _migrated_format_days_ago(200)


def test_requires_login():
    app = _app()
    with app.test_client() as client:
        resp = client.get('/api/cc/eligibility')
    assert resp.status_code in (302, 401)
