"""Tests for the character-creation draft lifecycle: submit -> review -> roster.

This path had no automated coverage at all, despite being how every player
character enters the roster. The adjacent RoD sheet-import lifecycle (which
shares the CharacterDraft table but is a separate flow) is well covered by
test_sheet_import_approval.py — these tests give the creation flow the same
treatment, following that file's conventions.

"""

import json
import sqlite3
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from flask import Blueprint, Flask, get_flashed_messages
from sqlalchemy.exc import OperationalError

import app.blueprints.cc_admin as cc_admin_module
from app.blueprints.cc_admin import bp as cc_admin_bp
from app.blueprints.character_creator import bp as character_creator_bp
from app.db import CharacterDraft, DbCharacter, DbCharacterBackground, db
from app.db_errors import db_unavailable_response
from app.models import AGE_CATEGORIES, CLANS
from app.db_service import DBService
from app.turso_http import TursoUnavailableError

# require_staff redirects unauthenticated requests to 'dashboard.login'; the
# real dashboard blueprint applies limiter.limit(...) at import time, so a
# minimal stand-in registers just the endpoint name url_for needs. Same
# approach as test_sheet_import_approval.py.
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
    # These cover the draft lifecycle, not the rollout gate, so open the
    # creator; the gate itself is covered in test_character_creation_gate.py.
    app.config['CHARACTER_CREATION_MODE'] = 'everyone'
    db.init_app(app)
    app.register_blueprint(cc_admin_bp)
    app.register_blueprint(character_creator_bp)
    app.register_blueprint(_fake_dashboard_bp)
    with app.app_context():
        db.create_all()
        # cc_admin does `from app import db_service` at import time, binding the
        # then-None singleton into its own namespace — so setting app.db_service
        # here would not reach it. Patch the blueprint module's attribute.
        cc_admin_module.db_service = DBService()
    return app


def _staff_client(app):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['authenticated'] = True
        sess['discord_name'] = 'teststaff'
    return client


def _player_client(app, discord_id='111'):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['authenticated'] = True
        sess['discord_id'] = discord_id
        sess['discord_name'] = 'testplayer'
    return client


_DEFAULT_DATA = {
    'clan': 'Toreador',
    'age_category': 'neonate',
    'cc_xp_budget': 60,
}


def _seed_draft(app, status='submitted', character_data=None, name='Fiona Vale',
                discord_id='111', roster_character_id=None):
    if character_data is None:
        character_data = json.dumps(_DEFAULT_DATA)
    with app.app_context():
        draft = CharacterDraft(
            player_discord_id=discord_id,
            character_name=name,
            status=status,
            roster_character_id=roster_character_id,
            character_data=character_data,
            submitted_at=datetime.now(timezone.utc) if status == 'submitted' else None,
        )
        db.session.add(draft)
        db.session.commit()
        return draft.id


# ── Player side: submit / resubmit ──────────────────────────────────────────

def test_submit_moves_draft_to_submitted():
    app = _app()
    draft_id = _seed_draft(app, status='draft')
    client = _player_client(app)
    res = client.post(f'/api/cc/characters/{draft_id}/submit')
    assert res.status_code == 200
    assert res.get_json()['status'] == 'submitted'
    with app.app_context():
        assert db.session.get(CharacterDraft, draft_id).submitted_at is not None


def test_submit_rejects_another_players_draft():
    """Ownership is enforced server-side, not just hidden in the UI."""
    app = _app()
    draft_id = _seed_draft(app, status='draft', discord_id='111')
    client = _player_client(app, discord_id='222')
    res = client.post(f'/api/cc/characters/{draft_id}/submit')
    assert res.status_code == 403
    with app.app_context():
        assert db.session.get(CharacterDraft, draft_id).status == 'draft'


def test_submit_rejects_already_approved_draft():
    app = _app()
    draft_id = _seed_draft(app, status='approved')
    client = _player_client(app)
    res = client.post(f'/api/cc/characters/{draft_id}/submit')
    assert res.status_code == 422


def test_revision_requested_draft_can_be_resubmitted():
    """The only 'send back' state is revision_requested, and it must be
    resubmittable — there is no terminal reject for creation drafts."""
    app = _app()
    draft_id = _seed_draft(app, status='revision_requested')
    client = _player_client(app)
    res = client.post(f'/api/cc/characters/{draft_id}/submit')
    assert res.status_code == 200
    assert res.get_json()['status'] == 'submitted'


# ── Staff side: request revision ────────────────────────────────────────────

def test_request_revision_sets_status_and_notes():
    app = _app()
    draft_id = _seed_draft(app)
    client = _staff_client(app)
    res = client.post(
        f'/cc-admin/drafts/{draft_id}/request-revision',
        data={'revision_notes': 'Clan does not match your background.'},
    )
    assert res.status_code in (200, 302)
    with app.app_context():
        draft = db.session.get(CharacterDraft, draft_id)
        assert draft.status == 'revision_requested'
        assert 'Clan does not match' in draft.revision_notes


def test_revision_notes_survive_resubmission():
    """Notes intentionally persist after the player resubmits, so the ST keeps
    the context of what they asked for."""
    app = _app()
    draft_id = _seed_draft(app)
    staff = _staff_client(app)
    staff.post(f'/cc-admin/drafts/{draft_id}/request-revision',
               data={'revision_notes': 'Please pick a different predator type.'})
    player = _player_client(app)
    player.post(f'/api/cc/characters/{draft_id}/submit')
    with app.app_context():
        draft = db.session.get(CharacterDraft, draft_id)
        assert draft.status == 'submitted'
        assert 'predator type' in draft.revision_notes


def test_request_revision_requires_staff():
    app = _app()
    draft_id = _seed_draft(app)
    res = app.test_client().post(f'/cc-admin/drafts/{draft_id}/request-revision',
                                 data={'revision_notes': 'nope'})
    assert res.status_code == 302  # redirected to login


# ── Staff side: approve -> roster ───────────────────────────────────────────

def test_approve_creates_roster_character():
    app = _app()
    draft_id = _seed_draft(app, name='Fiona Vale')
    client = _staff_client(app)
    res = client.post(f'/cc-admin/drafts/{draft_id}/approve')
    assert res.status_code in (200, 302)
    with app.app_context():
        draft = db.session.get(CharacterDraft, draft_id)
        assert draft.status == 'approved'
        assert draft.approved_at is not None
        assert draft.approved_by
        row = DbCharacter.query.filter(
            DbCharacter.character_name.ilike('Fiona Vale')
        ).first()
        assert row is not None
        assert row.active is True
        assert draft.roster_character_id == row.id


def test_approve_copies_clan_and_derives_sect():
    app = _app()
    draft_id = _seed_draft(app, character_data=json.dumps(
        {'clan': 'Toreador', 'age_category': 'neonate'}))
    _staff_client(app).post(f'/cc-admin/drafts/{draft_id}/approve')
    with app.app_context():
        row = DbCharacter.query.filter(
            DbCharacter.character_name.ilike('Fiona Vale')
        ).first()
        assert row.clan == 'Toreador'
        assert row.age_category == 'Neonate'  # normalized from 'neonate'
        assert row.sect == 'Camarilla'         # derived from the clan->sect map


def test_approve_normalizes_clan_spellings_the_creator_and_roster_disagree_on():
    """The SPA emits "Ministry"/"Thin-blood"; models.CLANS has "The Ministry"/
    "Thin-Blood". Approval used to copy the creator's spelling verbatim, so
    those characters were invisible to clan filters and would be rejected by
    the bot's own roster endpoint, which validates against CLANS."""
    app = _app()
    draft_id = _seed_draft(app, name='Serpent Sam', character_data=json.dumps(
        {'clan': 'Ministry', 'age_category': 'neonate'}))
    _staff_client(app).post(f'/cc-admin/drafts/{draft_id}/approve')
    with app.app_context():
        row = DbCharacter.query.filter(
            DbCharacter.character_name.ilike('Serpent Sam')
        ).first()
        assert row.clan == 'The Ministry'
        assert row.clan in CLANS
        assert row.sect == 'Anarch'  # sect lookup still resolves after renaming


def test_approve_stores_ghoul_as_a_real_age_category():
    """'Ghoul' is offered by the creator and now present in AGE_CATEGORIES.
    It previously capitalized to a value the roster's own list did not contain,
    so player.py had to special-case it to stop ghouls reading as ancilla."""
    app = _app()
    draft_id = _seed_draft(app, name='Renfield Ray', character_data=json.dumps(
        {'clan': 'Ventrue', 'age_category': 'ghoul'}))
    _staff_client(app).post(f'/cc-admin/drafts/{draft_id}/approve')
    with app.app_context():
        row = DbCharacter.query.filter(
            DbCharacter.character_name.ilike('Renfield Ray')
        ).first()
        assert row.age_category == 'Ghoul'
        assert row.age_category in AGE_CATEGORIES


def test_approve_stores_blank_clan_rather_than_an_unmatchable_one():
    """An unrecognised clan is stored empty — visibly wrong to staff — instead
    of a value no filter or validator will ever match."""
    app = _app()
    draft_id = _seed_draft(app, name='Mystery Mel', character_data=json.dumps(
        {'clan': 'Definitely Not A Clan', 'age_category': 'neonate'}))
    _staff_client(app).post(f'/cc-admin/drafts/{draft_id}/approve')
    with app.app_context():
        row = DbCharacter.query.filter(
            DbCharacter.character_name.ilike('Mystery Mel')
        ).first()
        assert row.clan == ''


def test_approve_falls_back_to_neonate_for_an_unknown_age_category():
    app = _app()
    draft_id = _seed_draft(app, name='Odd Olive', character_data=json.dumps(
        {'clan': 'Brujah', 'age_category': 'methuselah'}))
    _staff_client(app).post(f'/cc-admin/drafts/{draft_id}/approve')
    with app.app_context():
        row = DbCharacter.query.filter(
            DbCharacter.character_name.ilike('Odd Olive')
        ).first()
        assert row.age_category == 'Neonate'


def test_every_clan_the_creator_offers_normalizes_into_CLANS():
    """Guards against the two lists drifting apart again: every clan the SPA's
    clanNameSchema can emit must map onto a canonical roster clan."""
    from app.blueprints.cc_admin import normalize_cc_clan
    creator_clans = [
        'Brujah', 'Gangrel', 'Nosferatu', 'Malkavian', 'Tremere', 'Ventrue',
        'Toreador', 'Lasombra', 'Banu Haqim', 'Ministry', 'Ravnos', 'Tzimisce',
        'Hecata', 'Salubri', 'Caitiff', 'Thin-blood',
    ]
    for clan in creator_clans:
        normalized = normalize_cc_clan(clan)
        assert normalized in CLANS, f'{clan!r} normalized to {normalized!r}'


def test_every_clan_the_creator_offers_has_a_sect():
    from app.blueprints.cc_admin import _CLAN_SECT, normalize_cc_clan
    from app.models import SECTS
    creator_clans = [
        'Brujah', 'Gangrel', 'Nosferatu', 'Malkavian', 'Tremere', 'Ventrue',
        'Toreador', 'Lasombra', 'Banu Haqim', 'Ministry', 'Ravnos', 'Tzimisce',
        'Hecata', 'Salubri', 'Caitiff', 'Thin-blood',
    ]
    for clan in creator_clans:
        sect = _CLAN_SECT.get(normalize_cc_clan(clan).lower(), '')
        assert sect in SECTS, f'{clan!r} produced sect {sect!r}'


def test_approve_banks_unspent_starting_xp():
    """A neonate has a 15 XP budget; 9 spent on loresheets leaves 6 unspent,
    which the 5 XP cap trims to 5. That reaches the roster as creation_xp,
    which feeds total_xp directly in db_service._xp_totals."""
    app = _app()
    draft_id = _seed_draft(app, character_data=json.dumps({
        'clan': 'Toreador',
        'age_category': 'neonate',
        'cc_xp_budget': 15,
        'loresheet_purchases': [{'loresheet_id': 'descendant-of', 'dot': 1},
                                {'loresheet_id': 'descendant-of', 'dot': 2}],
    }))
    _staff_client(app).post(f'/cc-admin/drafts/{draft_id}/approve')
    with app.app_context():
        row = DbCharacter.query.filter(
            DbCharacter.character_name.ilike('Fiona Vale')
        ).first()
        assert (row.creation_xp or 0) == 5


def test_approve_banks_only_the_unspent_remainder_under_the_cap():
    """Spending nearly the whole budget banks only what is left, not the cap."""
    app = _app()
    draft_id = _seed_draft(app, character_data=json.dumps({
        'clan': 'Toreador',
        'age_category': 'neonate',
        'cc_xp_budget': 15,
        # 4 + 1 dots = 12 + 3 = 15 spent... leave 2 unspent instead:
        'loresheet_purchases': [{'loresheet_id': 'a', 'dot': 4},
                                {'loresheet_id': 'b', 'dot': 1}],
        'cc_base_attributes': {'strength': 2},
        'attributes': {'strength': 2},
    }))
    _staff_client(app).post(f'/cc-admin/drafts/{draft_id}/approve')
    with app.app_context():
        row = DbCharacter.query.filter(
            DbCharacter.character_name.ilike('Fiona Vale')
        ).first()
        assert (row.creation_xp or 0) == 0  # 12 + 3 = 15 spent, nothing left


def test_approve_counts_attribute_raises_against_the_budget():
    """Trait raises measured against the persisted v8 baseline count as spend,
    so they reduce what can be banked."""
    app = _app()
    draft_id = _seed_draft(app, character_data=json.dumps({
        'clan': 'Toreador',
        'age_category': 'ancilla',
        'cc_xp_budget': 35,
        'cc_base_attributes': {'strength': 2},
        'attributes': {'strength': 4},  # (3x5) + (4x5) = 35 spent
    }))
    _staff_client(app).post(f'/cc-admin/drafts/{draft_id}/approve')
    with app.app_context():
        row = DbCharacter.query.filter(
            DbCharacter.character_name.ilike('Fiona Vale')
        ).first()
        assert (row.creation_xp or 0) == 0


def test_approve_caps_banked_xp_for_in_memoriam_ancilla():
    """The 5 XP cap applies on the era-derived In-Memoriam path too."""
    app = _app()
    draft_id = _seed_draft(app, character_data=json.dumps({
        'clan': 'Nosferatu',
        'age_category': 'ancilla',
        'cc_xp_budget': 0,
        'in_memoriam': {'use_standard': False, 'total_xp': 60, 'eras': []},
    }))
    _staff_client(app).post(f'/cc-admin/drafts/{draft_id}/approve')
    with app.app_context():
        row = DbCharacter.query.filter(
            DbCharacter.character_name.ilike('Fiona Vale')
        ).first()
        assert (row.creation_xp or 0) == 5


def test_approve_grants_no_xp_to_zero_budget_ages():
    """Ghoul/Mortal/Fledgling get a 0 XP budget, so 0 is correct for them —
    this half of the rule already holds today."""
    app = _app()
    draft_id = _seed_draft(app, character_data=json.dumps(
        {'clan': 'Caitiff', 'age_category': 'fledgling', 'cc_xp_budget': 0}))
    _staff_client(app).post(f'/cc-admin/drafts/{draft_id}/approve')
    with app.app_context():
        row = DbCharacter.query.filter(
            DbCharacter.character_name.ilike('Fiona Vale')
        ).first()
        assert (row.creation_xp or 0) == 0


def test_approve_links_existing_roster_row_instead_of_duplicating():
    app = _app()
    with app.app_context():
        existing = DbCharacter(character_name='Fiona Vale', age_category='Neonate',
                               active=True, player_discord='111')
        db.session.add(existing)
        db.session.commit()
        existing_id = existing.id
    draft_id = _seed_draft(app, name='Fiona Vale')
    _staff_client(app).post(f'/cc-admin/drafts/{draft_id}/approve')
    with app.app_context():
        rows = DbCharacter.query.filter(
            DbCharacter.character_name.ilike('Fiona Vale')
        ).all()
        assert len(rows) == 1
        assert rows[0].id == existing_id
        assert db.session.get(CharacterDraft, draft_id).status == 'approved'


# ── Approval must not touch a roster row the player doesn't own ─────────────

def _roster_row(app, name='Fiona Vale', owner='222', mawla=4):
    """A roster character with a background worth protecting."""
    with app.app_context():
        row = DbCharacter(character_name=name, age_category='Neonate', active=True,
                          player_discord=owner)
        db.session.add(row)
        db.session.add(DbCharacterBackground(
            character_name=name, background_key='mawla', background_name='Mawla',
            dots_total=mawla, updated_by='test',
        ))
        db.session.commit()
        return row.id


def _draft_with_mawla(level=1):
    return json.dumps({**_DEFAULT_DATA, 'backgrounds': [{'name': 'Mawla', 'level': level}]})


def _approve(app, draft_id):
    """Post an approval; return (response, flashed messages)."""
    client = _staff_client(app)
    with client:
        res = client.post(f'/cc-admin/drafts/{draft_id}/approve')
        return res, get_flashed_messages(with_categories=True)


def _assert_refused(app, res, messages, draft_id, *, mentions=None):
    assert res.status_code == 302
    assert res.headers['Location'].endswith(f'/cc-admin/drafts/{draft_id}')
    assert [category for category, _ in messages] == ['danger']
    if mentions:
        assert mentions in messages[0][1]
    with app.app_context():
        draft = db.session.get(CharacterDraft, draft_id)
        assert draft.status == 'submitted'
        assert draft.approved_at is None
        assert draft.approved_by in (None, '')


def _mawla_dots(app, name='Fiona Vale'):
    with app.app_context():
        return DbCharacterBackground.query.filter_by(
            character_name=name, background_key='mawla').one().dots_total


@pytest.mark.parametrize('draft_name', ['Fiona Vale', 'fiona vale'])
def test_approve_refuses_a_name_belonging_to_another_player(draft_name):
    app = _app()
    _roster_row(app, owner='222', mawla=4)
    draft_id = _seed_draft(app, name=draft_name, discord_id='111',
                           character_data=_draft_with_mawla(1))

    res, messages = _approve(app, draft_id)

    _assert_refused(app, res, messages, draft_id, mentions='another player')
    assert _mawla_dots(app) == 4
    with app.app_context():
        assert db.session.get(CharacterDraft, draft_id).roster_character_id is None


def test_approve_refuses_a_name_on_an_unclaimed_roster_row():
    """A blank owner isn't "nobody's": it can be a real character whose player
    never linked. The player can self-link it, after which approval goes through."""
    app = _app()
    _roster_row(app, owner='', mawla=4)
    draft_id = _seed_draft(app, discord_id='111', character_data=_draft_with_mawla(1))

    res, messages = _approve(app, draft_id)

    _assert_refused(app, res, messages, draft_id, mentions='not linked')
    assert _mawla_dots(app) == 4


def test_approve_refuses_a_draft_already_pointing_at_another_players_row():
    app = _app()
    row_id = _roster_row(app, name='Other Name', owner='222', mawla=4)
    draft_id = _seed_draft(app, name='Fiona Vale', discord_id='111',
                           roster_character_id=row_id,
                           character_data=_draft_with_mawla(1))

    res, messages = _approve(app, draft_id)

    _assert_refused(app, res, messages, draft_id, mentions='another player')
    assert _mawla_dots(app, 'Other Name') == 4


@pytest.mark.parametrize('draft_name', ['Fiona_Vale', 'Fiona%', '%'])
def test_approve_treats_like_wildcards_in_a_name_literally(draft_name):
    app = _app()
    existing_id = _roster_row(app, owner='222', mawla=4)
    draft_id = _seed_draft(app, name=draft_name, discord_id='111',
                           character_data=_draft_with_mawla(1))

    res, _ = _approve(app, draft_id)

    assert res.status_code == 302
    assert _mawla_dots(app) == 4
    with app.app_context():
        draft = db.session.get(CharacterDraft, draft_id)
        assert draft.status == 'approved'
        assert draft.roster_character_id != existing_id
        row = db.session.get(DbCharacter, draft.roster_character_id)
        assert row.character_name == draft_name
        assert row.player_discord == '111'


def test_approve_updates_the_players_own_row_under_its_roster_spelling():
    """Backgrounds are keyed by name, so writing them under the draft's casing
    would strand them on a character that doesn't exist."""
    app = _app()
    row_id = _roster_row(app, owner='111', mawla=4)
    draft_id = _seed_draft(app, name='fiona vale', discord_id='111',
                           character_data=_draft_with_mawla(2))

    res, _ = _approve(app, draft_id)

    assert res.status_code == 302
    assert _mawla_dots(app) == 2
    with app.app_context():
        draft = db.session.get(CharacterDraft, draft_id)
        assert draft.status == 'approved'
        assert draft.roster_character_id == row_id
        assert DbCharacterBackground.query.count() == 1


def test_approve_matches_non_ascii_names_the_way_the_database_compares_them():
    """SQLite's lower() is ASCII-only, so comparing it with Python's lower()
    would miss this row and then hit the unique constraint on insert."""
    app = _app()
    row_id = _roster_row(app, name='Élise', owner='111', mawla=4)
    draft_id = _seed_draft(app, name='Élise', discord_id='111')

    _approve(app, draft_id)

    with app.app_context():
        draft = db.session.get(CharacterDraft, draft_id)
        assert draft.status == 'approved'
        assert draft.roster_character_id == row_id


# ── Approved means the roster has it ────────────────────────────────────────

def test_approve_refuses_a_draft_with_no_name():
    app = _app()
    draft_id = _seed_draft(app, name='   ')

    res, messages = _approve(app, draft_id)

    _assert_refused(app, res, messages, draft_id, mentions='name')
    with app.app_context():
        assert DbCharacter.query.count() == 0


def test_failed_roster_creation_leaves_the_draft_unapproved(monkeypatch):
    app = _app()
    draft_id = _seed_draft(app, character_data=_draft_with_mawla(2))

    def boom(*_args, **_kwargs):
        raise RuntimeError('turso is having a moment')

    monkeypatch.setattr(cc_admin_module.db_service, 'add_character', boom)
    res, messages = _approve(app, draft_id)

    _assert_refused(app, res, messages, draft_id)
    with app.app_context():
        assert db.session.get(CharacterDraft, draft_id).roster_character_id is None
        assert DbCharacterBackground.query.count() == 0


def test_failure_after_roster_creation_rolls_the_roster_row_back():
    """add_character used to commit, saving the approval and the new character
    before backgrounds were looked at. A bad level then left it half-approved."""
    app = _app()
    draft_id = _seed_draft(app, character_data=json.dumps({
        **_DEFAULT_DATA, 'backgrounds': [{'name': 'Mawla', 'level': 'lots'}],
    }))

    res, messages = _approve(app, draft_id)

    _assert_refused(app, res, messages, draft_id)
    with app.app_context():
        assert DbCharacter.query.count() == 0
        assert DbCharacterBackground.query.count() == 0


def test_a_failed_approval_can_be_retried(monkeypatch):
    app = _app()
    draft_id = _seed_draft(app, character_data=_draft_with_mawla(2))

    def boom(*_args, **_kwargs):
        raise RuntimeError('turso is having a moment')

    with monkeypatch.context() as patched:
        patched.setattr(cc_admin_module.db_service, 'add_character', boom)
        _approve(app, draft_id)

    res, messages = _approve(app, draft_id)

    assert res.status_code == 302
    assert [category for category, _ in messages] == ['success']
    assert _mawla_dots(app) == 2
    with app.app_context():
        assert db.session.get(CharacterDraft, draft_id).status == 'approved'


def _app_with_outage_handling():
    """The part of app/__init__.py's handler that decides how an outage is answered."""
    app = _app()

    def handle(exc):
        response = db_unavailable_response(exc)
        if response is None:
            raise exc
        return response

    app.register_error_handler(OperationalError, handle)
    return app


def _commit_failing_with(monkeypatch, orig):
    def boom():
        raise OperationalError('COMMIT', {}, orig)

    monkeypatch.setattr(db.session, 'commit', boom)


def _turso_failure(may_have_applied):
    orig = TursoUnavailableError('Turso connection error: x')
    orig.may_have_applied = may_have_applied
    return orig


def test_turso_outage_before_anything_applied_answers_503(monkeypatch):
    app = _app_with_outage_handling()
    draft_id = _seed_draft(app)

    with monkeypatch.context() as patched:
        _commit_failing_with(patched, _turso_failure(may_have_applied=False))
        res, messages = _approve(app, draft_id)

    assert res.status_code == 503
    assert messages == []
    with app.app_context():
        assert db.session.get(CharacterDraft, draft_id).status == 'submitted'
        assert DbCharacter.query.count() == 0


def test_lost_commit_answer_is_not_reported_as_nothing_changed(monkeypatch):
    """The commit may have landed, so "the roster was not changed" could be false.
    It has to reach the generic handler, which records and alerts on it."""
    app = _app_with_outage_handling()
    draft_id = _seed_draft(app)

    with monkeypatch.context() as patched:
        _commit_failing_with(patched, _turso_failure(may_have_applied=True))
        with pytest.raises(OperationalError):
            _approve(app, draft_id)


def test_operational_error_turso_refused_reaches_the_generic_handler(monkeypatch):
    app = _app_with_outage_handling()
    draft_id = _seed_draft(app)

    with monkeypatch.context() as patched:
        _commit_failing_with(patched, sqlite3.OperationalError('Turso: no such table: t'))
        with pytest.raises(OperationalError):
            _approve(app, draft_id)


def test_outage_handling_survives_a_failing_rollback(monkeypatch):
    """Rollback fails too during an outage, and must not replace the commit's
    error: a rollback failure doesn't carry may_have_applied."""
    app = _app_with_outage_handling()
    draft_id = _seed_draft(app)

    def rollback_boom():
        raise OperationalError('ROLLBACK', {}, _turso_failure(may_have_applied=False))

    with monkeypatch.context() as patched:
        _commit_failing_with(patched, _turso_failure(may_have_applied=True))
        patched.setattr(db.session, 'rollback', rollback_boom)
        with pytest.raises(OperationalError) as info:
            _approve(app, draft_id)

    assert info.value.orig.may_have_applied is True


def test_retrying_an_approval_that_already_landed_adds_nothing():
    """What staff will do after a lost commit answer."""
    app = _app()
    draft_id = _seed_draft(app, character_data=_draft_with_mawla(2))

    _approve(app, draft_id)
    _, messages = _approve(app, draft_id)

    assert [category for category, _ in messages] == ['success']
    assert _mawla_dots(app) == 2
    with app.app_context():
        assert DbCharacter.query.count() == 1


def test_sheets_mirror_failure_does_not_undo_an_approval(monkeypatch):
    """Sheets is a best-effort mirror, and is only told once the row is committed."""
    app = _app()
    draft_id = _seed_draft(app)
    seen = []

    class BrokenSheets:
        def sync_add_character(self, char):
            with app.app_context():
                seen.append(DbCharacter.query.filter_by(
                    character_name=char.character_name).count())
            raise RuntimeError('sheets is down')

    monkeypatch.setattr(cc_admin_module, 'sheets_sync', BrokenSheets())
    res, messages = _approve(app, draft_id)

    assert res.status_code == 302
    assert [category for category, _ in messages] == ['success']
    assert seen == [1]
    with app.app_context():
        assert db.session.get(CharacterDraft, draft_id).status == 'approved'


def test_approve_requires_staff():
    app = _app()
    draft_id = _seed_draft(app)
    res = app.test_client().post(f'/cc-admin/drafts/{draft_id}/approve')
    assert res.status_code == 302
    with app.app_context():
        assert db.session.get(CharacterDraft, draft_id).status == 'submitted'


def test_approve_survives_malformed_character_data():
    """draft_approve guards its json.loads and falls back to {} — approval must
    not be blocked by a corrupt blob (contrast draft_list below)."""
    app = _app()
    draft_id = _seed_draft(app, character_data='{not valid json')
    res = _staff_client(app).post(f'/cc-admin/drafts/{draft_id}/approve')
    assert res.status_code in (200, 302)
    with app.app_context():
        assert db.session.get(CharacterDraft, draft_id).status == 'approved'


# ── Pre-v7 schema drift ─────────────────────────────────────────────────────

def test_approve_of_pre_v7_draft_without_backgrounds_key():
    """Pre-v7 drafts keep everything in `merits` and have no `backgrounds` key.
    Approval must still succeed; background sync is simply a no-op. There is no
    schema_version gate on the Flask side, so this tolerance is load-bearing."""
    app = _app()
    draft_id = _seed_draft(app, character_data=json.dumps({
        'clan': 'Nosferatu',
        'age_category': 'neonate',
        'merits': [{'name': 'Status', 'level': 2}],
    }))
    res = _staff_client(app).post(f'/cc-admin/drafts/{draft_id}/approve')
    assert res.status_code in (200, 302)
    with app.app_context():
        assert db.session.get(CharacterDraft, draft_id).status == 'approved'


# ── Known gap: unguarded json.loads in the staff drafts list ────────────────

def test_player_draft_list_tolerates_one_corrupt_draft():
    """Same guard on the player-facing API: a corrupt blob must degrade that
    draft to character_data=null, not lock the player out of every draft."""
    app = _app()
    _seed_draft(app, status='draft', name='Good Draft')
    _seed_draft(app, status='draft', name='Corrupt Draft',
                character_data='{not valid json')
    res = _player_client(app).get('/api/cc/characters')
    assert res.status_code == 200
    payload = res.get_json()
    assert len(payload) == 2
    by_name = {d['character_name']: d for d in payload}
    assert by_name['Corrupt Draft']['character_data'] is None
    assert by_name['Good Draft']['character_data']['clan'] == 'Toreador'


def test_draft_list_tolerates_one_corrupt_draft():
    """One corrupt character_data used to 500 the entire staff drafts list via
    a bare json.loads; _safe_char_data degrades that row to {} instead."""
    app = _app()
    _seed_draft(app, name='Good Draft')
    _seed_draft(app, name='Corrupt Draft', character_data='{not valid json')
    client = _staff_client(app)
    with patch('app.blueprints.cc_admin.render_template', return_value=''):
        res = client.get('/cc-admin/drafts')
    assert res.status_code == 200
