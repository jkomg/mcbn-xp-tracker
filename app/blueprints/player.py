"""Public player-facing routes. No authentication required."""

from flask import Blueprint, render_template, request, abort
from app import sheets_client

bp = Blueprint('player', __name__)


@bp.route('/')
def lookup():
    """Player landing page with character search/select."""
    characters = sheets_client.get_active_characters()
    characters.sort(key=lambda c: c.character_name.lower())
    return render_template('player/lookup.html', characters=characters)


@bp.route('/<name>')
def character(name):
    """Public character XP summary — read-only."""
    char = sheets_client.get_character(name)
    if not char:
        abort(404)

    claims = sheets_client.get_claims_for_character(name)
    spends = sheets_client.get_spends_for_character(name)

    # Only show approved data to players
    approved_claims = [
        c for c in claims if c.status.lower() == 'approved'
    ]
    approved_spends = [
        s for s in spends if s.status.lower() == 'approved'
    ]
    pending_claims = [
        c for c in claims if c.status.lower() == 'pending'
    ]
    pending_spends = [
        s for s in spends if s.status.lower() == 'pending'
    ]

    earned_xp = sum(c.approved_xp for c in approved_claims)
    total_spends = sum(s.verified_cost for s in approved_spends)
    total_xp = char.creation_xp + earned_xp
    available_xp = total_xp - total_spends

    ledger = sheets_client.get_ledger_for_character(name)

    return render_template(
        'player/character.html',
        char=char,
        earned_xp=earned_xp,
        total_xp=total_xp,
        total_spends=total_spends,
        available_xp=available_xp,
        approved_claims=approved_claims,
        approved_spends=approved_spends,
        pending_claims_count=len(pending_claims),
        pending_spends_count=len(pending_spends),
        ledger=ledger,
    )
