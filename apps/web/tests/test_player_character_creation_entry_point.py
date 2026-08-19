"""The player dashboard must offer a way into the character creator.

For a while it did not: the only link to /player/new was an "Edit" button
inside the `{% if pending_drafts %}` block on my_characters.html, so a player
could reach the creator only if they already had a draft — and there was no
way to make a first one from the web UI at all. These tests pin the entry
point in both states so it cannot silently disappear again.
"""

import os

from flask import Blueprint, Flask
from flask_wtf.csrf import CSRFProtect

from app.blueprints import character_creator as cc_module
from app.blueprints import player as player_module
from app.cc_access import can_create_characters
from app.db import DbCharacter, db
from app.db_service import DBService

_TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), '..', 'app', 'templates')
_STATIC_DIR = os.path.join(os.path.dirname(__file__), '..', 'app', 'static')

_fake_dashboard_bp = Blueprint('dashboard', __name__)


@_fake_dashboard_bp.route('/login')
def login():
    return 'login', 200


def _app(mode='everyone'):
    """Build the player app.

    Defaults to an open creator because these tests are about the entry point
    existing at all; the gated states are covered further down.
    """
    app = Flask(__name__, template_folder=_TEMPLATES_DIR, static_folder=_STATIC_DIR)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = 'test'
    app.config['ALLOWED_DISCORD_IDS'] = set()
    app.config['CHARACTER_CREATION_MODE'] = mode
    db.init_app(app)

    # Mirrors create_app's inject_auth, which templates read for this flag.
    @app.context_processor
    def _inject_cc_gate():
        return {'can_create_characters': can_create_characters()}

    CSRFProtect().init_app(app)
    player_module.db_service = DBService(sheets_client=None)
    app.register_blueprint(player_module.bp, url_prefix='/player')
    # Registered for url_for('character_creator.character_creator_new') to
    # resolve — the link under test points at it.
    app.register_blueprint(cc_module.bp)
    app.register_blueprint(_fake_dashboard_bp)
    with app.app_context():
        db.create_all()
    return app


def _player_client(app, discord_id='111'):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['discord_id'] = discord_id
    return client


def _seed_character(app, discord_id='111'):
    with app.app_context():
        db.session.add(DbCharacter(
            character_name='Alice Active',
            player_discord=discord_id,
            active=True,
            status='active',
        ))
        db.session.commit()


def test_empty_state_offers_character_creation():
    """A brand-new player with nothing linked must be able to start a
    character — this was the case with no route into the creator at all."""
    app = _app()
    res = _player_client(app).get('/player/')
    assert res.status_code == 200
    body = res.get_data(as_text=True)
    assert '/player/new' in body
    assert 'Create a Character' in body


def test_empty_state_still_offers_linking():
    """Creating and linking are different journeys; offering only one strands
    players who already have an approved roster character."""
    app = _app()
    res = _player_client(app).get('/player/')
    body = res.get_data(as_text=True)
    assert 'Link an Existing Character' in body


def test_retired_only_player_still_gets_creation_actions():
    """A player whose only characters are retired falls into the
    `elif retired_count` branch with an empty my_characters list. The actions
    used to live inside the other two branches, so that player saw only
    "Show retired/deceased" and no way into the creator."""
    app = _app()
    with app.app_context():
        db.session.add(DbCharacter(
            character_name='Ghost Of Sessions Past',
            player_discord='111',
            active=False,
            status='retired',
        ))
        db.session.commit()
    res = _player_client(app).get('/player/')
    assert res.status_code == 200
    body = res.get_data(as_text=True)
    assert '/player/new' in body
    assert 'Show 1 retired/deceased' in body


def test_creation_link_signals_a_fresh_draft():
    """The creator restores the last character and draft id from localStorage,
    so a bare /player/new resumes it — and the autosave then writes over that
    draft, which may already be submitted. ?new=1 tells the SPA to start
    clean; without it the "create" action silently edits the previous
    character."""
    app = _app()
    _seed_character(app)
    body = _player_client(app).get('/player/').get_data(as_text=True)
    assert '/player/new?new=1' in body


def test_existing_characters_page_offers_creation():
    """A player with characters must still be able to create another."""
    app = _app()
    _seed_character(app)
    res = _player_client(app).get('/player/')
    assert res.status_code == 200
    body = res.get_data(as_text=True)
    assert '/player/new' in body
    assert 'Create a new character' in body


def test_new_player_is_not_redirected_into_a_dead_end():
    """A player with no characters and no drafts used to be redirected to the
    link-character flow, which for a genuinely new player shows 'no unlinked
    characters — contact an ST' and offers no way to create one. They must
    land on the dashboard and see both options."""
    app = _app()
    res = _player_client(app).get('/player/')
    assert res.status_code == 200, 'new player should not be redirected away'


def test_link_page_also_offers_creation():
    """The link page is reachable directly and is where players land when
    hunting for a character that isn't there — it needs the creator too."""
    app = _app()
    res = _player_client(app).get('/player/link')
    assert res.status_code == 200
    assert '/player/new' in res.get_data(as_text=True)


# ── Rollout gate ──────────────────────────────────────────────────────────

def test_entry_point_is_hidden_when_creation_is_off():
    """The feature deploys dark: no button until it is switched on."""
    app = _app(mode='off')
    _seed_character(app)
    body = _player_client(app).get('/player/').get_data(as_text=True)
    assert '/player/new' not in body
    assert 'Create a new character' not in body


def test_empty_state_still_offers_linking_when_creation_is_off():
    """A gated creator must not strand a player who has a roster character."""
    app = _app(mode='off')
    body = _player_client(app).get('/player/').get_data(as_text=True)
    assert 'Link an Existing Character' in body
    assert "isn't open yet" in body


def test_link_page_hides_creation_when_off():
    app = _app(mode='off')
    body = _player_client(app).get('/player/link').get_data(as_text=True)
    assert '/player/new' not in body


def test_pilot_player_sees_the_entry_point_in_staff_mode():
    """The pilot list is how a few players get in before launch."""
    app = _app(mode='staff')
    app.config['CHARACTER_CREATION_PILOT_DISCORD_IDS'] = '111'
    _seed_character(app)
    body = _player_client(app, discord_id='111').get('/player/').get_data(as_text=True)
    assert '/player/new?new=1' in body


def test_non_pilot_player_does_not_see_it_in_staff_mode():
    app = _app(mode='staff')
    app.config['CHARACTER_CREATION_PILOT_DISCORD_IDS'] = '999'
    _seed_character(app, discord_id='111')
    body = _player_client(app, discord_id='111').get('/player/').get_data(as_text=True)
    assert '/player/new' not in body
