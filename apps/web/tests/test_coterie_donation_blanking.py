"""Donating a background hands it to the coterie as an asset its members spend
over time — it does not withhold the dots from everyone.

`approve_donation` used to set `dots_blanked = dots_total`, which drove
`dots_available` to 0. That hid the coterie's Blank control (gated on
`dots_available > 0`) and made `blank_character_background` refuse with "only 0
available", so `blank_donated_background` was unreachable for a properly donated
background despite having a route, a UI control and a release-night badge.
"""

import os
import sys

from flask import Blueprint, Flask
from flask_wtf.csrf import CSRFProtect

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.blueprints import coteries as coteries_module  # noqa: E402
from app.db import (Coterie, CoterieMember, DbCharacter,  # noqa: E402
                    DbCharacterBackground, DbPlayPeriod, db)
from app.db_service import DBService  # noqa: E402

STAFF_ID = '999'
_TEMPLATES_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', 'app', 'templates'))
_STATIC_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', 'app', 'static'))

_player_stub = Blueprint('player', __name__)


@_player_stub.route('/player/<name>')
def character(name):
    return 'ok'


_roster_stub = Blueprint('roster', __name__)


@_roster_stub.route('/roster/<name>')
def detail(name):
    return 'ok'


def _app():
    app = Flask(__name__, template_folder=_TEMPLATES_DIR, static_folder=_STATIC_DIR)
    app.config.update(TESTING=True, SQLALCHEMY_DATABASE_URI='sqlite:///:memory:',
                      SQLALCHEMY_TRACK_MODIFICATIONS=False, SECRET_KEY='test',
                      WTF_CSRF_ENABLED=False, ALLOWED_DISCORD_IDS={STAFF_ID})
    db.init_app(app)
    CSRFProtect().init_app(app)
    app.register_blueprint(coteries_module.bp, url_prefix='/coteries')
    app.register_blueprint(_player_stub)
    app.register_blueprint(_roster_stub)
    with app.app_context():
        db.create_all()
    return app


def _client(app, discord_id):
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['discord_id'] = discord_id
        if discord_id == STAFF_ID:
            sess['authenticated'] = True
            sess['staff_user'] = 'Staff Tester'
    return c


def _setup(app):
    """An active coterie with one member who has a 3-dot background pending
    donation, and an open night so blanking is possible."""
    with app.app_context():
        coterie = Coterie(name='The Accord', slug='accord', status='active',
                          creation_state='active')
        db.session.add(coterie)
        char = DbCharacter(character_name='Fiora', player_discord='111',
                           active=True, status='active')
        db.session.add(char)
        db.session.add(DbPlayPeriod(period_label='Night 68', night_number=68,
                                    active=True, submissions_open=True))
        db.session.flush()
        db.session.add(CoterieMember(coterie_id=coterie.id,
                                     roster_character_id=char.id,
                                     free_dots_remaining=2, role='leader'))
        db.session.commit()
        DBService().set_character_background('Fiora', 'Haven', 3, 'test')
        bg = DbCharacterBackground.query.one()
        bg.donation_pending_coterie_id = coterie.id
        db.session.commit()
        return bg.id


def _bg(app, bg_id):
    with app.app_context():
        return db.session.get(DbCharacterBackground, bg_id)


def test_approving_a_donation_leaves_the_dots_spendable():
    app = _app()
    bg_id = _setup(app)

    _client(app, STAFF_ID).post(f'/coteries/accord/donate/{bg_id}/approve')

    row = _bg(app, bg_id)
    assert row.donated_coterie_id is not None, 'the donation went through'
    assert row.dots_blanked == 0
    assert row.dots_available == 3, 'the coterie has all three to spend'


def test_the_coterie_can_blank_a_donated_background():
    """The regression. This is the whole point of blank_donated_background."""
    app = _app()
    bg_id = _setup(app)
    _client(app, STAFF_ID).post(f'/coteries/accord/donate/{bg_id}/approve')

    _client(app, '111').post(f'/coteries/accord/blank/{bg_id}', data={'dots': 1})

    row = _bg(app, bg_id)
    assert row.dots_blanked == 1
    assert row.dots_available == 2
    assert row.release_night_number == 69, 'scheduled like any other blank'


def test_the_blank_control_is_offered_on_the_coterie_sheet():
    """It is gated on dots_available > 0, so a fully blanked background hides it."""
    app = _app()
    bg_id = _setup(app)
    _client(app, STAFF_ID).post(f'/coteries/accord/donate/{bg_id}/approve')

    body = _client(app, '111').get('/coteries/accord').get_data(as_text=True)

    assert f'/coteries/accord/blank/{bg_id}' in body


def test_undonating_returns_the_background_whole():
    """Ending the donation cancels the coterie's outstanding blanks rather than
    handing back a partly spent background."""
    app = _app()
    bg_id = _setup(app)
    _client(app, STAFF_ID).post(f'/coteries/accord/donate/{bg_id}/approve')
    _client(app, '111').post(f'/coteries/accord/blank/{bg_id}', data={'dots': 2})
    assert _bg(app, bg_id).dots_blanked == 2

    _client(app, '111').post(f'/coteries/accord/undonate/{bg_id}')

    row = _bg(app, bg_id)
    assert row.donated_coterie_id is None
    assert row.dots_blanked == 0
    assert row.dots_available == 3


# ---------------------------------------------------------------------------
# Per-blank lots on a donated background
# ---------------------------------------------------------------------------

def _audit(app, action_type):
    from app.db import DbAuditLog
    with app.app_context():
        return [(r.staff_user, r.target_character, r.details)
                for r in DbAuditLog.query.filter_by(action_type=action_type)]


def _open_night(app, night):
    with app.app_context():
        DbPlayPeriod.query.update({'submissions_open': False})
        db.session.add(DbPlayPeriod(period_label=f'Night {night}', night_number=night,
                                    active=True, submissions_open=True))
        db.session.commit()


def _lots(app, bg_id):
    from app.db import DbCharacterBackgroundBlank
    with app.app_context():
        return [(lot.dots, lot.release_night_number, lot.released_at is None)
                for lot in DbCharacterBackgroundBlank.query.filter_by(
                    character_background_id=bg_id).order_by(DbCharacterBackgroundBlank.id)]


def test_a_coterie_blank_is_its_own_lot_and_is_audited():
    app = _app()
    bg_id = _setup(app)
    _client(app, STAFF_ID).post(f'/coteries/accord/donate/{bg_id}/approve')

    _client(app, '111').post(f'/coteries/accord/blank/{bg_id}', data={'dots': 1})
    _open_night(app, 69)
    _client(app, '111').post(f'/coteries/accord/blank/{bg_id}', data={'dots': 1})

    assert _lots(app, bg_id) == [(1, 69, True), (1, 73, True)]
    assert _audit(app, 'coterie_background_blank') == [
        ('player:Fiora', 'Fiora', 'Haven: blanked 1 dot(s) for The Accord, release night 69'),
        ('player:Fiora', 'Fiora', 'Haven: blanked 1 dot(s) for The Accord, release night 73'),
    ]


def test_the_coterie_sheet_lists_each_pending_release():
    app = _app()
    bg_id = _setup(app)
    _client(app, STAFF_ID).post(f'/coteries/accord/donate/{bg_id}/approve')
    _client(app, '111').post(f'/coteries/accord/blank/{bg_id}', data={'dots': 1})
    _open_night(app, 69)
    _client(app, '111').post(f'/coteries/accord/blank/{bg_id}', data={'dots': 2})

    body = _client(app, '111').get('/coteries/accord').get_data(as_text=True)

    assert '3 blanked' in body
    assert '1 back on Night 69 · 2 back on Night 73' in ' '.join(body.split())
    assert f'/coteries/accord/blank/{bg_id}' not in body, 'nothing left to blank'


def test_undonating_discards_the_lots_and_is_audited():
    app = _app()
    bg_id = _setup(app)
    _client(app, STAFF_ID).post(f'/coteries/accord/donate/{bg_id}/approve')
    _client(app, '111').post(f'/coteries/accord/blank/{bg_id}', data={'dots': 2})

    _client(app, '111').post(f'/coteries/accord/undonate/{bg_id}')

    assert _lots(app, bg_id) == []
    assert _audit(app, 'coterie_background_blanks_discarded') == [
        ('player:Fiora', 'Fiora',
         'Haven: 2 blanked dot(s) cancelled when it was withdrawn from The Accord'),
    ]


def test_removing_the_donor_discards_the_lots_and_is_audited():
    app = _app()
    bg_id = _setup(app)
    _client(app, STAFF_ID).post(f'/coteries/accord/donate/{bg_id}/approve')
    _client(app, '111').post(f'/coteries/accord/blank/{bg_id}', data={'dots': 2})
    with app.app_context():
        member_id = CoterieMember.query.one().id

    _client(app, STAFF_ID).post(f'/coteries/accord/members/{member_id}/remove')

    row = _bg(app, bg_id)
    assert row.donated_coterie_id is None
    assert row.dots_available == 3
    assert _lots(app, bg_id) == []
    assert _audit(app, 'coterie_background_blanks_discarded') == [
        ('Staff Tester', 'Fiora',
         'Haven: 2 blanked dot(s) cancelled when Fiora was removed from The Accord'),
    ]
    with app.app_context():
        assert CoterieMember.query.count() == 0


def test_undonating_leaves_released_history_alone():
    """Only outstanding lots are discarded; a lot that already came back is
    history, not a blank."""
    import importlib
    app = _app()
    bg_id = _setup(app)
    _client(app, STAFF_ID).post(f'/coteries/accord/donate/{bg_id}/approve')
    _client(app, '111').post(f'/coteries/accord/blank/{bg_id}', data={'dots': 1})
    with app.app_context():
        module = importlib.import_module('app.db_service')
        original = module.night_has_started
        module.night_has_started = lambda night, today=None: True
        try:
            DBService().release_due_background_blanks(69)
        finally:
            module.night_has_started = original
    _client(app, '111').post(f'/coteries/accord/blank/{bg_id}', data={'dots': 1})

    _client(app, '111').post(f'/coteries/accord/undonate/{bg_id}')

    assert _lots(app, bg_id) == [(1, 69, False)]
    assert _audit(app, 'coterie_background_blanks_discarded')[0][2].startswith('Haven: 1 blanked')
