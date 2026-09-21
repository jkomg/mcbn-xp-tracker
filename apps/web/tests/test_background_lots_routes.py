"""Per-blank lots through the routes that show and change them.

The player sheet, a player's own blank and re-rate, and staff approval of a
creator draft that lowers a rating. Coterie routes are covered in
test_coterie_donation_blanking.py.
"""

import json
import os

from flask import Blueprint, Flask, get_flashed_messages
from flask_wtf.csrf import CSRFProtect

import app as app_module
import app.blueprints.cc_admin as cc_admin_module
from app.blueprints import player as player_module
from app.db import (CharacterDraft, DbAuditLog, DbCharacter, DbCharacterBackground,
                    DbPlayPeriod, db)
from app.db_service import DBService

_TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), '..', 'app', 'templates')
_STATIC_DIR = os.path.join(os.path.dirname(__file__), '..', 'app', 'static')

_fake_dashboard_bp = Blueprint('dashboard', __name__)


@_fake_dashboard_bp.route('/login')
def login():
    return 'login', 200


def _app():
    app = Flask(__name__, template_folder=_TEMPLATES_DIR, static_folder=_STATIC_DIR)
    app.config.update(
        TESTING=True, SQLALCHEMY_DATABASE_URI='sqlite:///:memory:',
        SQLALCHEMY_TRACK_MODIFICATIONS=False, SECRET_KEY='test',
        ALLOWED_DISCORD_IDS=set(), WTF_CSRF_ENABLED=False,
        CHARACTER_CREATION_MODE='everyone',
    )
    db.init_app(app)
    CSRFProtect().init_app(app)
    # require_character_owner resolves ownership through app.db_service.
    app_module.db_service = DBService(sheets_client=None)
    player_module.db_service = DBService(sheets_client=None)
    cc_admin_module.db_service = DBService(sheets_client=None)
    app.register_blueprint(player_module.bp, url_prefix='/player')
    app.register_blueprint(cc_admin_module.bp)
    app.register_blueprint(_fake_dashboard_bp)
    with app.app_context():
        db.create_all()
        db.session.add(DbCharacter(character_name='Alice', player_discord='111',
                                   active=True, status='active'))
        db.session.add(DbPlayPeriod(period_label='Night 68', night_number=68,
                                    submissions_open=True, active=True))
        db.session.commit()
        DBService().set_character_background('Alice', 'Mawla', 4, 'test')
    return app


def _player(app):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['discord_id'] = '111'
        sess['discord_name'] = 'alice-player'
    return client


def _staff(app):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['authenticated'] = True
        sess['staff_user'] = 'Staff Tester'
    return client


def _open_night(app, night):
    with app.app_context():
        DbPlayPeriod.query.update({'submissions_open': False})
        db.session.add(DbPlayPeriod(period_label=f'Night {night}', night_number=night,
                                    submissions_open=True, active=True))
        db.session.commit()


def _blank(client, dots):
    with client:
        client.post('/player/Alice/backgrounds/blank',
                    data={'background_name': 'Mawla', 'dots': dots})
        return ' '.join(message for message in get_flashed_messages())


def _release_cell(body):
    """The Release column of the Mawla row on the player sheet."""
    row = body[body.index('<td>Mawla</td>'):]
    row = row[:row.index('</tr>')]
    cells = row.split('<td>')
    return ' '.join(cells[5].split())


def _audit(action_type):
    return [row.details for row in DbAuditLog.query.filter_by(action_type=action_type)]


# ── The player sheet ─────────────────────────────────────────────────────────

def test_sheet_with_nothing_blanked_shows_no_release():
    app = _app()
    body = _player(app).get('/player/Alice').get_data(as_text=True)
    assert _release_cell(body).startswith('—')


def test_sheet_with_one_lot_shows_its_night():
    app = _app()
    client = _player(app)
    _blank(client, 1)

    body = client.get('/player/Alice').get_data(as_text=True)

    assert '1 on Night 69' in _release_cell(body)


def test_sheet_with_two_lots_shows_both_nights():
    app = _app()
    client = _player(app)
    _blank(client, 1)
    _open_night(app, 69)
    _blank(client, 2)

    cell = _release_cell(client.get('/player/Alice').get_data(as_text=True))

    assert '1 on Night 69' in cell
    assert '2 on Night 73' in cell


# ── A player's own blank and re-rate ────────────────────────────────────────

def test_blank_flash_names_this_lots_night():
    app = _app()
    message = _blank(_player(app), 2)
    assert 'Blanked 2 dot(s) of Mawla; they return on Night 69.' in message
    assert 'in all' not in message, 'nothing else is out'


def test_blank_flash_mentions_other_lots_without_implying_this_is_the_only_one():
    app = _app()
    client = _player(app)
    _blank(client, 1)
    _open_night(app, 69)

    message = _blank(client, 2)

    assert 'they return on Night 73' in message
    assert '3 dot(s) are now blanked in all; the next return is Night 69' in message


def test_lowering_a_rating_below_the_blank_is_audited():
    app = _app()
    client = _player(app)
    _blank(client, 3)

    client.post('/player/Alice/backgrounds/set',
                data={'background_name': 'Mawla', 'dots_total': '1'})

    with app.app_context():
        assert DbCharacterBackground.query.one().dots_blanked == 1
        assert _audit('player_background_set') == ['Mawla => 1 dots; 2 blanked dot(s) discarded']


# ── Staff approval of a creator draft ───────────────────────────────────────

def _approve_draft(app, backgrounds):
    with app.app_context():
        char = DbCharacter.query.filter_by(character_name='Alice').one()
        draft = CharacterDraft(
            player_discord_id='111', character_name='Alice', status='submitted',
            roster_character_id=char.id,
            character_data=json.dumps({
                'clan': 'Toreador', 'age_category': 'neonate', 'cc_xp_budget': 60,
                'backgrounds': backgrounds,
            }),
        )
        db.session.add(draft)
        db.session.commit()
        draft_id = draft.id
    _staff(app).post(f'/cc-admin/drafts/{draft_id}/approve')
    return draft_id


def test_approval_lowering_a_rating_trims_the_newest_lot_and_is_audited():
    app = _app()
    client = _player(app)
    _blank(client, 2)                 # back on 69
    _open_night(app, 69)
    _blank(client, 2)                 # back on 73

    draft_id = _approve_draft(app, [{'name': 'Mawla', 'level': 3}])

    with app.app_context():
        row = DbCharacterBackground.query.one()
        assert row.dots_total == 3
        assert [(lot.dots, lot.release_night_number) for lot in row.outstanding_blanks] == [(2, 69), (1, 73)]
        assert _audit('cc_draft_approve') == [
            f'Approved character creation draft {draft_id}; rating reduced blanked dots: Mawla -1'
        ]


def test_approval_that_changes_no_lot_is_still_audited():
    """draft_approve committed with no audit entry at all before this."""
    app = _app()
    client = _player(app)
    _blank(client, 1)

    draft_id = _approve_draft(app, [{'name': 'Mawla', 'level': 3}])

    with app.app_context():
        assert DbCharacterBackground.query.one().dots_blanked == 1
        assert _audit('cc_draft_approve') == [f'Approved character creation draft {draft_id}']


def test_approving_a_draft_with_backgrounds_creates_them():
    """draft_approve called _background_key on the DBService instance, where it
    does not exist, so every draft carrying backgrounds raised part-way through
    approval -- after the roster entry had already been committed."""
    app = _app()

    res = _approve_draft(app, [{'name': 'Mawla', 'level': 4}, {'name': 'Allies', 'level': 2}])

    assert res
    with app.app_context():
        rows = {row.background_name: row.dots_total for row in DbCharacterBackground.query}
        assert rows == {'Mawla': 4, 'Allies': 2}
