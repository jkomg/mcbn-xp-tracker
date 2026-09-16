"""Staff view of outstanding background blanks (/roster/blanks).

Rows are built through blank_character_background, the real write path, rather
than constructed by hand, and the calendar's notion of today is pinned so the
due/pending split does not drift as real time passes.
"""

from datetime import date
from pathlib import Path

import pytest
from flask import Blueprint, Flask
from flask_wtf import CSRFProtect

import app as app_module
import app.blueprints.roster as roster_module
from app import game_calendar
from app.db import DbCharacter, db
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
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
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
    flask_app.register_blueprint(_stub_bp('player', '/player', {'/': 'my_characters'}))
    flask_app.register_blueprint(_stub_bp('wiki', '/wiki', {'/': 'index'}))
    flask_app.register_blueprint(_stub_bp('cc_admin', '/cc-admin', {'/drafts': 'draft_list'}))
    flask_app.register_blueprint(_stub_bp('coteries', '/coteries', {'/': 'index'}))
    flask_app.register_blueprint(_stub_bp('settings', '/settings', {'/': 'index'}))
    flask_app.register_blueprint(_stub_bp('reports', '/reports', {'/': 'index'}))
    flask_app.register_blueprint(_stub_bp('local_status', '/local/status', {'/': 'status_page'}))
    flask_app.register_blueprint(roster_module.bp, url_prefix='/roster')
    with flask_app.app_context():
        db.create_all()
        svc = DBService()
        monkeypatch.setattr(app_module, 'db_service', svc)
        monkeypatch.setattr(roster_module, 'db_service', svc)
        yield flask_app


def _staff(client):
    with client.session_transaction() as sess:
        sess['authenticated'] = True
        sess['discord_id'] = '12345'
        sess['staff_user'] = 'Tester'


def _blank(name, background, rating, dots, night):
    svc = DBService()
    if not DbCharacter.query.filter_by(character_name=name).first():
        db.session.add(DbCharacter(character_name=name, player_discord='1', active=True, status='active'))
        db.session.commit()
    svc.set_character_background(name, background, rating, 'test')
    svc.blank_character_background(name, background, dots, night, 'test')


def _rows(body: str) -> dict[str, str]:
    """character name → the data-state of its row."""
    import re
    return {
        m.group(2): m.group(1)
        for m in re.finditer(r'<tr data-state="(\w+)">\s*<td><a [^>]*>([^<]+)</a>', body)
    }


def test_each_row_is_marked_by_calendar_state(app):
    _blank('Aludra', 'Allies', 3, 2, 68)   # returns Night 69, already open → due
    _blank('Bastet', 'Mawla', 2, 1, 69)    # returns Night 73, not yet open → pending
    _blank('Corvin', 'Haven', 1, 1, 77)    # no downtime after 77 on the calendar → unknown

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
    _blank('Aludra', 'Allies', 3, 2, 68)
    _blank('Corvin', 'Haven', 1, 1, 77)

    client = app.test_client()
    _staff(client)
    body = client.get('/roster/blanks').get_data(as_text=True)

    assert 'should already be back' in body
    assert "doesn&#39;t list" in body or "doesn't list" in body


def test_released_blanks_drop_off_the_view(app):
    _blank('Aludra', 'Allies', 3, 2, 68)
    DBService().release_due_background_blanks(69)

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
    _blank('Aludra', 'Allies', 3, 2, 68)
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
