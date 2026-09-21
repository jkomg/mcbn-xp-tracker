"""Staff view of outstanding background blanks (/roster/blanks).

Rows are built by a player using the real routes -- setting the background on
their sheet, then blanking it while a night is open -- so the view is tested
against what those routes actually record, including the night they stamp. The
calendar's notion of today is pinned so the due/pending split does not drift as
real time passes.
"""

import time
import uuid
from datetime import date
from pathlib import Path

import pytest
from flask import Blueprint, Flask
from flask_wtf import CSRFProtect

import app as app_module
import app.blueprints.api as api_module
import app.blueprints.player as player_module
import app.blueprints.roster as roster_module
from app import game_calendar
from app.db import DbCharacter, DbPlayPeriod, db
from app.db_service import DBService

_TEMPLATE_DIR = str(Path(__file__).resolve().parents[1] / 'app' / 'templates')
_STATIC_DIR = str(Path(__file__).resolve().parents[1] / 'app' / 'static')

# Night 69 opened 2026-09-08 and Night 73 opens 2026-11-03.
_TODAY = date(2026, 9, 16)


class _PinnedDate(date):
    @classmethod
    def today(cls):
        return _TODAY


def _stub_bp(name: str, prefix: str, routes: dict[str, str]) -> Blueprint:
    bp = Blueprint(name, __name__, url_prefix=prefix)
    for rule, fn_name in routes.items():
        bp.add_url_rule(rule, fn_name, lambda **_: ('', 200))
    return bp


@pytest.fixture()
def app(monkeypatch):
    monkeypatch.setattr(game_calendar, 'date', _PinnedDate)
    flask_app = Flask(__name__, template_folder=_TEMPLATE_DIR, static_folder=_STATIC_DIR)
    flask_app.config.update(
        TESTING=True, SECRET_KEY='test', SQLALCHEMY_DATABASE_URI='sqlite:///:memory:',
        SQLALCHEMY_TRACK_MODIFICATIONS=False, WTF_CSRF_ENABLED=False,
        ALLOWED_DISCORD_IDS=set(), WEB_APP_API_WRITE_TOKEN='write-token',
        BOT_API_REPLAY_PROTECTION_ENABLED=True, BOT_API_REPLAY_WINDOW_SECONDS=300,
        BOT_API_NONCE_TTL_SECONDS=600, BOT_API_NONCE_CACHE_SIZE=1000,
    )
    CSRFProtect(flask_app)
    db.init_app(flask_app)
    flask_app.register_blueprint(_stub_bp('dashboard', '/', {
        '/': 'index', '/login': 'login', '/logout': 'logout', '/view-as/clear': 'clear_view_as',
    }))
    flask_app.register_blueprint(_stub_bp('claims', '/claims', {'/pending': 'pending'}))
    flask_app.register_blueprint(_stub_bp('spends', '/spends', {'/pending': 'pending'}))
    flask_app.register_blueprint(_stub_bp('periods', '/periods', {'/list': 'list_periods'}))
    flask_app.register_blueprint(_stub_bp('audit', '/audit', {'/': 'log', '/errors': 'errors'}))
    flask_app.register_blueprint(_stub_bp('wiki', '/wiki', {'/': 'index'}))
    flask_app.register_blueprint(_stub_bp('cc_admin', '/cc-admin', {'/drafts': 'draft_list'}))
    flask_app.register_blueprint(_stub_bp('coteries', '/coteries', {'/': 'index'}))
    flask_app.register_blueprint(_stub_bp('settings', '/settings', {'/': 'index'}))
    flask_app.register_blueprint(_stub_bp('reports', '/reports', {'/': 'index'}))
    flask_app.register_blueprint(_stub_bp('local_status', '/local/status', {'/': 'status_page'}))
    flask_app.register_blueprint(roster_module.bp, url_prefix='/roster')
    flask_app.register_blueprint(player_module.bp, url_prefix='/player')
    flask_app.register_blueprint(api_module.bp, url_prefix='/api')
    with flask_app.app_context():
        db.create_all()
        svc = DBService()
        monkeypatch.setattr(app_module, 'db_service', svc)
        monkeypatch.setattr(roster_module, 'db_service', svc)
        monkeypatch.setattr(player_module, 'db_service', svc)
        monkeypatch.setattr(api_module, 'db_service', svc)
        yield flask_app


def _staff(client):
    with client.session_transaction() as sess:
        sess['authenticated'] = True
        sess['discord_id'] = '12345'
        sess['staff_user'] = 'Tester'


_PLAYERS = {'Aludra': '111', 'Bastet': '222', 'Corvin': '333'}


def _open_night(night):
    """Make `night` the one open play period, as staff do from the periods page."""
    DbPlayPeriod.query.update({'submissions_open': False})
    db.session.add(DbPlayPeriod(period_label=f'Night {night}', night_number=night,
                                submissions_open=True, active=True))
    db.session.commit()


def _blank(app, name, background, rating, dots, night):
    """The player sets the background on their sheet, then blanks it."""
    if not DbCharacter.query.filter_by(character_name=name).first():
        db.session.add(DbCharacter(character_name=name, player_discord=_PLAYERS[name],
                                   active=True, status='active'))
        db.session.commit()
    _open_night(night)
    player = app.test_client()
    with player.session_transaction() as sess:
        sess['discord_id'] = _PLAYERS[name]
        sess['discord_name'] = name.lower()
    set_res = player.post(f'/player/{name}/backgrounds/set',
                          data={'background_name': background, 'dots_total': rating})
    blank_res = player.post(f'/player/{name}/backgrounds/blank',
                            data={'background_name': background, 'dots': dots})
    assert (set_res.status_code, blank_res.status_code) == (302, 302)


def _rows(body: str) -> dict[str, str]:
    """character name → the data-state of its row."""
    import re
    return {
        m.group(2): m.group(1)
        for m in re.finditer(r'<tr data-state="(\w+)">\s*<td><a [^>]*>([^<]+)</a>', body)
    }


def test_each_row_is_marked_by_calendar_state(app):
    _blank(app, 'Aludra', 'Allies', 3, 2, 68)   # returns Night 69, already open → due
    _blank(app, 'Bastet', 'Mawla', 2, 1, 69)    # returns Night 73, not yet open → pending
    _blank(app, 'Corvin', 'Haven', 1, 1, 77)    # no downtime after 77 on the calendar → unknown

    client = app.test_client()
    _staff(client)
    res = client.get('/roster/blanks')

    assert res.status_code == 200
    body = res.get_data(as_text=True)
    assert _rows(body) == {'Aludra': 'due', 'Bastet': 'pending', 'Corvin': 'unknown'}
    assert 'Due, not released' in body
    assert 'Not yet due' in body
    assert 'Night not on calendar' in body
    assert '2 / 3' in body
    assert 'opens 9/8/2026' in body


def test_due_and_unknown_rows_raise_a_banner(app):
    _blank(app, 'Aludra', 'Allies', 3, 2, 68)
    _blank(app, 'Corvin', 'Haven', 1, 1, 77)

    client = app.test_client()
    _staff(client)
    body = client.get('/roster/blanks').get_data(as_text=True)

    assert 'should already be back' in body
    assert "doesn&#39;t list" in body or "doesn't list" in body


def test_released_blanks_drop_off_the_view(app):
    _blank(app, 'Aludra', 'Allies', 3, 2, 68)
    _open_night(69)
    # What the bot's release worker calls every two minutes.
    res = app.test_client().post('/api/backgrounds/release-due', headers={
        'Authorization': 'Bearer write-token',
        'X-Request-Timestamp': str(int(time.time())),
        # Nonces are remembered process-wide, so a fixed one collides with other tests.
        'X-Request-Nonce': f'roster-blanks-{uuid.uuid4()}',
    })
    assert res.status_code == 200, res.get_json()
    assert [r['dots_released'] for r in res.get_json()['released']] == [2]

    client = app.test_client()
    _staff(client)
    body = client.get('/roster/blanks').get_data(as_text=True)

    assert _rows(body) == {}
    assert 'No background has dots blanked right now.' in body


def test_empty_state_instead_of_an_empty_table(app):
    client = app.test_client()
    _staff(client)
    body = client.get('/roster/blanks').get_data(as_text=True)

    assert 'No background has dots blanked right now.' in body
    assert 'id="blanks-table"' not in body


def test_non_staff_are_turned_away(app):
    _blank(app, 'Aludra', 'Allies', 3, 2, 68)
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['discord_id'] = '111'   # a signed-in player, not staff

    res = client.get('/roster/blanks')

    assert res.status_code == 302
    assert '/login' in res.headers['Location']


def test_linked_from_staff_navigation(app):
    client = app.test_client()
    _staff(client)
    body = client.get('/roster/blanks').get_data(as_text=True)

    assert 'href="/roster/blanks"' in body
