"""Tests for the character-creation rollout gate (app/cc_access.py).

The feature ships dark: the wizard and its API are deployed before players are
meant to reach them, so the default must be closed, and the entry point in the
UI must never disagree with what the endpoints will actually allow.
"""

import pytest
from flask import Flask

from app.cc_access import (
    can_create_characters,
    character_creation_mode,
    pilot_discord_ids,
)
from app.db import db


def _app(**config):
    application = Flask(__name__)
    application.config['TESTING'] = True
    application.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    application.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    application.config['SECRET_KEY'] = 'test'
    application.config['ALLOWED_DISCORD_IDS'] = {'staff-1'}
    application.config.update(config)
    db.init_app(application)
    with application.app_context():
        db.create_all()
    return application


def _session(app, **values):
    """Return a request context with the given session values applied."""
    ctx = app.test_request_context('/')
    ctx.push()
    from flask import session
    session.update(values)
    return ctx


# ── Defaults ──────────────────────────────────────────────────────────────

def test_mode_defaults_to_off():
    """Deploying the feature must not turn it on."""
    app = _app()
    with app.app_context():
        assert character_creation_mode() == 'off'


def test_unrecognised_mode_reads_as_off():
    """A typo in the settings field should close the gate, not open it."""
    app = _app(CHARACTER_CREATION_MODE='enabled')
    with app.app_context():
        assert character_creation_mode() == 'off'


# ── Mode behaviour ────────────────────────────────────────────────────────

@pytest.mark.parametrize('mode,discord_id,staff,expected', [
    # off stops everyone, staff included — it is the emergency switch.
    ('off', 'player-9', False, False),
    ('off', 'staff-1', True, False),
    # staff mode is the production-testing stage.
    ('staff', 'staff-1', True, True),
    ('staff', 'player-9', False, False),
    # everyone is launch.
    ('everyone', 'player-9', False, True),
    ('everyone', '', False, True),
])
def test_mode_decides_who_may_create(mode, discord_id, staff, expected):
    app = _app(CHARACTER_CREATION_MODE=mode)
    ctx = _session(app, discord_id=discord_id, authenticated=staff)
    try:
        assert can_create_characters() is expected
    finally:
        ctx.pop()


def test_pilot_ids_get_in_during_staff_mode():
    app = _app(
        CHARACTER_CREATION_MODE='staff',
        CHARACTER_CREATION_PILOT_DISCORD_IDS='pilot-1, pilot-2',
    )
    ctx = _session(app, discord_id='pilot-2')
    try:
        assert can_create_characters() is True
    finally:
        ctx.pop()

    ctx = _session(app, discord_id='someone-else')
    try:
        assert can_create_characters() is False
    finally:
        ctx.pop()


def test_pilot_ids_are_ignored_when_mode_is_off():
    """off means off — otherwise it is not a usable emergency switch."""
    app = _app(
        CHARACTER_CREATION_MODE='off',
        CHARACTER_CREATION_PILOT_DISCORD_IDS='pilot-1',
    )
    ctx = _session(app, discord_id='pilot-1')
    try:
        assert can_create_characters() is False
    finally:
        ctx.pop()


def test_pilot_ids_parse_from_messy_input():
    app = _app(CHARACTER_CREATION_PILOT_DISCORD_IDS=' a1 ,\n b2,,c3 ')
    with app.app_context():
        assert pilot_discord_ids() == {'a1', 'b2', 'c3'}


def test_explicit_discord_id_overrides_the_session():
    """Callers that already know the id shouldn't need a session."""
    app = _app(
        CHARACTER_CREATION_MODE='staff',
        CHARACTER_CREATION_PILOT_DISCORD_IDS='pilot-1',
    )
    ctx = _session(app)
    try:
        assert can_create_characters('pilot-1') is True
        assert can_create_characters('nobody') is False
    finally:
        ctx.pop()


def test_staff_previewing_as_a_player_sees_the_player_gate():
    """view_as makes is_staff() false so staff can check the real experience."""
    app = _app(CHARACTER_CREATION_MODE='staff')
    ctx = _session(app, discord_id='staff-1', authenticated=True, view_as='player')
    try:
        assert can_create_characters() is False
    finally:
        ctx.pop()


# ── Runtime override ──────────────────────────────────────────────────────

def test_settings_override_beats_env_without_a_redeploy():
    from app.app_settings import set_app_setting

    app = _app(CHARACTER_CREATION_MODE='off')
    with app.app_context():
        set_app_setting('CHARACTER_CREATION_MODE', 'everyone', 'tester')
        assert character_creation_mode() == 'everyone'


# ── Endpoint enforcement ──────────────────────────────────────────────────
#
# Hiding the button is not a gate: /player/new and the CC API are reachable by
# anyone who knows the URL, so the endpoints must refuse independently.

import json  # noqa: E402

from app.blueprints import character_creator as cc_module  # noqa: E402
from app.blueprints import player as player_module  # noqa: E402
from app.db import CharacterDraft  # noqa: E402
from app.db_service import DBService  # noqa: E402


def _api_app(mode='off', pilots=''):
    app = _app(
        CHARACTER_CREATION_MODE=mode,
        CHARACTER_CREATION_PILOT_DISCORD_IDS=pilots,
    )
    app.register_blueprint(cc_module.bp)
    # The gated page redirects to the player dashboard, so that endpoint has to
    # exist for url_for to resolve — as it does in the real app.
    player_module.db_service = DBService(sheets_client=None)
    app.register_blueprint(player_module.bp, url_prefix='/player')
    return app


def _client(app, discord_id='player-9', staff=False):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['discord_id'] = discord_id
        if staff:
            sess['authenticated'] = True
    return client


def _seed_draft(app, owner='player-9', status='draft'):
    with app.app_context():
        draft = CharacterDraft(
            id='draft-1',
            player_discord_id=owner,
            character_name='Test Fledgling',
            status=status,
            character_data=json.dumps({'name': 'Test Fledgling'}),
        )
        db.session.add(draft)
        db.session.commit()
    return 'draft-1'


def test_wizard_page_redirects_when_creation_is_off():
    app = _api_app()
    res = _client(app).get('/player/new')
    assert res.status_code == 302
    assert '/player' in res.headers['Location']


def test_create_endpoint_refuses_when_off():
    app = _api_app()
    res = _client(app).post('/api/cc/characters', json={'character_name': 'Sneaky'})
    assert res.status_code == 403
    assert res.get_json()['code'] == 'character_creation_disabled'


def test_submit_endpoint_refuses_when_off():
    app = _api_app()
    _seed_draft(app)
    res = _client(app).post('/api/cc/characters/draft-1/submit')
    assert res.status_code == 403


def test_create_endpoint_refuses_a_non_pilot_in_staff_mode():
    app = _api_app(mode='staff', pilots='pilot-1')
    res = _client(app, discord_id='player-9').post('/api/cc/characters', json={})
    assert res.status_code == 403


def test_create_endpoint_allows_a_pilot_in_staff_mode():
    app = _api_app(mode='staff', pilots='pilot-1')
    res = _client(app, discord_id='pilot-1').post('/api/cc/characters', json={})
    assert res.status_code in (200, 201)


def test_staff_can_still_edit_a_draft_under_review_while_gated():
    """STs review through the same SPA and the same PUT endpoint. Closing the
    gate must not strand drafts already sitting in the review queue."""
    app = _api_app(mode='off')
    _seed_draft(app, owner='someone-else', status='submitted')
    res = _client(app, discord_id='staff-1', staff=True).put(
        '/api/cc/characters/draft-1',
        json={'character_data': {'name': 'Edited By ST'}},
    )
    assert res.status_code == 200


def test_player_cannot_edit_their_draft_while_gated():
    app = _api_app(mode='off')
    _seed_draft(app)
    res = _client(app).put('/api/cc/characters/draft-1', json={'character_data': {}})
    assert res.status_code == 403


def test_reading_and_deleting_own_draft_stay_open_while_gated():
    """A draft caught by the gate closing must still be visible and removable,
    or a player is left with a row they can neither open nor clear."""
    app = _api_app(mode='off')
    _seed_draft(app)
    client = _client(app)
    assert client.get('/api/cc/characters').status_code == 200
    assert client.delete('/api/cc/characters/draft-1').status_code in (200, 204)
