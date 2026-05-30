"""Character Creator — SPA serving routes, session auth, and draft CRUD API.

Serves the React character creator SPA at /player/new and /player/<name>/sheet.
Exposes /api/auth/me for session auth and /api/cc/* for draft management.
"""

import json
import os
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request, send_from_directory, session

from app.auth import is_staff, require_login, require_character_owner
from app.db import CharacterDraft, DbCharacter, db

bp = Blueprint('character_creator', __name__)

_STATIC_DIR = os.path.join(os.path.dirname(__file__), '..', 'static', 'character-app')


def _discord_id():
    return session.get('discord_id', '')


def _draft_to_dict(draft):
    return {
        'id': draft.id,
        'player_discord_id': draft.player_discord_id,
        'character_name': draft.character_name,
        'name': draft.character_name,  # alias for Progeny sidebar compatibility
        'status': draft.status,
        'is_spc': draft.is_spc,
        'ticket_channel_id': draft.ticket_channel_id,
        'character_data': json.loads(draft.character_data) if draft.character_data else None,
        'created_at': draft.created_at.isoformat() if draft.created_at else None,
        'updated_at': draft.updated_at.isoformat() if draft.updated_at else None,
        'submitted_at': draft.submitted_at.isoformat() if draft.submitted_at else None,
        'approved_at': draft.approved_at.isoformat() if draft.approved_at else None,
        'revision_notes': draft.revision_notes or '',
    }


# ---------------------------------------------------------------------------
# Auth endpoint
# ---------------------------------------------------------------------------

@bp.route('/api/auth/me')
def auth_me():
    """Return the current Discord session user for the character creator SPA."""
    discord_id = _discord_id()
    if not discord_id:
        return jsonify({'error': 'Unauthorized'}), 401
    discord_name = session.get('discord_name', '')
    return jsonify({
        'id': discord_id,
        'username': discord_name,
        'display_name': discord_name,
        'is_staff': is_staff(),
    })


# ---------------------------------------------------------------------------
# SPA routes
# ---------------------------------------------------------------------------

@bp.route('/player/new')
@require_login
def character_creator_new():
    """New character wizard — serves the React SPA."""
    return send_from_directory(_STATIC_DIR, 'index.html')


@bp.route('/player/<name>/sheet')
@require_character_owner
def character_creator_sheet(name):  # noqa: ARG001
    """Character sheet view/edit — serves the React SPA."""
    return send_from_directory(_STATIC_DIR, 'index.html')


# ---------------------------------------------------------------------------
# CC draft CRUD API
# ---------------------------------------------------------------------------

@bp.route('/api/cc/characters')
@require_login
def cc_list_drafts():
    """List the current player's character drafts."""
    drafts = (
        CharacterDraft.query
        .filter_by(player_discord_id=_discord_id())
        .order_by(CharacterDraft.created_at.desc())
        .all()
    )
    return jsonify([_draft_to_dict(d) for d in drafts])


@bp.route('/api/cc/characters', methods=['POST'])
@require_login
def cc_create_draft():
    """Create a new character draft."""
    discord_id = _discord_id()
    body = request.get_json() or {}
    char_data = body.get('character_data')
    draft = CharacterDraft(
        player_discord_id=discord_id,
        character_name=body.get('character_name') or '',
        character_data=json.dumps(char_data) if char_data is not None else None,
        is_spc=bool(body.get('is_spc', False)),
        ticket_channel_id=body.get('ticket_channel_id') or None,
    )
    db.session.add(draft)
    db.session.commit()
    return jsonify(_draft_to_dict(draft)), 201


@bp.route('/api/cc/characters/<draft_id>')
@require_login
def cc_get_draft(draft_id):
    """Get a single draft. Staff can read any draft; players can only read their own."""
    draft = db.session.get(CharacterDraft, draft_id)
    if draft is None:
        return jsonify({'error': 'Not found'}), 404
    if draft.player_discord_id != _discord_id() and not is_staff():
        return jsonify({'error': 'Forbidden'}), 403
    return jsonify(_draft_to_dict(draft))


@bp.route('/api/cc/characters/<draft_id>', methods=['PUT'])
@require_login
def cc_update_draft(draft_id):
    """Save (auto-save) a draft. Editable while awaiting or under ST review; locked once approved."""
    draft = db.session.get(CharacterDraft, draft_id)
    if draft is None:
        return jsonify({'error': 'Not found'}), 404
    if draft.player_discord_id != _discord_id() and not is_staff():
        return jsonify({'error': 'Forbidden'}), 403
    if draft.status not in ('draft', 'submitted', 'revision_requested'):
        return jsonify({'error': f'Cannot edit a draft with status: {draft.status}'}), 422

    body = request.get_json() or {}
    if 'character_name' in body:
        draft.character_name = body['character_name'] or ''
    if 'character_data' in body:
        char_data = body['character_data']
        draft.character_data = json.dumps(char_data) if char_data is not None else None
    draft.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(_draft_to_dict(draft))


@bp.route('/api/cc/characters/<draft_id>', methods=['DELETE'])
@require_login
def cc_delete_draft(draft_id):
    """Player deletes their own draft. Only draft/revision_requested may be deleted."""
    draft = db.session.get(CharacterDraft, draft_id)
    if draft is None:
        return jsonify({'error': 'Not found'}), 404
    if draft.player_discord_id != _discord_id() and not is_staff():
        return jsonify({'error': 'Forbidden'}), 403
    if draft.status in ('submitted', 'approved'):
        return jsonify({'error': f'Cannot delete a draft with status: {draft.status}'}), 422
    db.session.delete(draft)
    db.session.commit()
    return '', 204


@bp.route('/api/cc/characters/<draft_id>/submit', methods=['POST'])
@require_login
def cc_submit_draft(draft_id):
    """Player submits a draft for ST review."""
    draft = db.session.get(CharacterDraft, draft_id)
    if draft is None:
        return jsonify({'error': 'Not found'}), 404
    if draft.player_discord_id != _discord_id():
        return jsonify({'error': 'Forbidden'}), 403
    if draft.status not in ('draft', 'revision_requested'):
        return jsonify({'error': f'Cannot submit a draft with status: {draft.status}'}), 422

    draft.status = 'submitted'
    draft.submitted_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(_draft_to_dict(draft))


# ---------------------------------------------------------------------------
# Ancilla eligibility check
# ---------------------------------------------------------------------------

@bp.route('/api/cc/eligibility')
@require_login
def cc_eligibility():
    """Check if the player is eligible to create an Ancilla character.

    Eligibility requires at least one active roster character added to the game
    at least 60 days ago (2 months on-server requirement).  We use DbCharacter
    (the roster) rather than CharacterDraft because approval sets roster entries
    directly via the bot's /lasombra approve command.
    """
    discord_id = _discord_id()
    cutoff_str = (datetime.now(timezone.utc) - timedelta(days=60)).strftime('%Y-%m-%d')
    oldest = (
        DbCharacter.query
        .filter(
            DbCharacter.player_discord == discord_id,
            DbCharacter.active == True,  # noqa: E712
            DbCharacter.date_added != '',
            DbCharacter.date_added <= cutoff_str,
        )
        .order_by(DbCharacter.date_added.asc())
        .first()
    )
    return jsonify({
        'eligible': oldest is not None,
        'earliest_approved_at': oldest.date_added if oldest else None,
    })
