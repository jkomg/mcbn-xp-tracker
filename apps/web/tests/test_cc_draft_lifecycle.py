"""Tests for the character-creation draft lifecycle: submit -> review -> roster.

This path had no automated coverage at all, despite being how every player
character enters the roster. The adjacent RoD sheet-import lifecycle (which
shares the CharacterDraft table but is a separate flow) is well covered by
test_sheet_import_approval.py — these tests give the creation flow the same
treatment, following that file's conventions.

One behavior here is pinned as *current* rather than ideal, and says so:
draft_approve copies clan/age_category/sect onto the roster row without
validating them. Pinning it means a later correctness pass changes the
assertion on purpose instead of discovering the behavior by accident.
"""

import json
from datetime import datetime, timezone
from unittest.mock import patch

from flask import Blueprint, Flask

import app.blueprints.cc_admin as cc_admin_module
from app.blueprints.cc_admin import bp as cc_admin_bp
from app.blueprints.character_creator import bp as character_creator_bp
from app.db import CharacterDraft, DbCharacter, db
from app.db_service import DBService

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
        assert row.age_category == 'Neonate'  # capitalized from 'neonate'
        assert row.sect == 'Camarilla'         # derived from the clan->sect map


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
                               active=True)
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
