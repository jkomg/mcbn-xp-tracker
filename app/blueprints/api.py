"""Bot-facing API routes.

These endpoints are intended for Discord bot integration and use a shared
bearer token (`WEB_APP_API_TOKEN`) separate from staff Discord OAuth.
"""

from __future__ import annotations

from functools import wraps

from flask import Blueprint, current_app, jsonify, request

from app import sheets_client

bp = Blueprint('api', __name__)


def _auth_failed():
    return jsonify({'error': 'Unauthorized'}), 401


def require_bot_token(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        expected = current_app.config.get('WEB_APP_API_TOKEN', '')
        if not expected:
            return jsonify({'error': 'Bot API token not configured on server'}), 503

        header = request.headers.get('Authorization', '')
        if not header.startswith('Bearer '):
            return _auth_failed()

        provided = header.split(' ', 1)[1].strip()
        if provided != expected:
            return _auth_failed()

        return f(*args, **kwargs)

    return decorated


def _require_sheets():
    if sheets_client is None:
        return jsonify({'error': 'Google Sheets backend is not configured'}), 503
    return None


def _open_periods_desc():
    periods = [p for p in sheets_client.get_all_periods() if p.submissions_open and p.active]
    periods.sort(key=lambda p: p.night_number, reverse=True)
    return periods


@bp.route('/health', methods=['GET'])
def health():
    return jsonify({'ok': True})


@bp.route('/meta/claim-context', methods=['GET'])
@require_bot_token
def claim_context():
    backend = _require_sheets()
    if backend:
        return backend

    characters = sheets_client.get_active_characters()
    characters.sort(key=lambda c: c.character_name.lower())
    open_periods = _open_periods_desc()

    return jsonify(
        {
            'activeCharacters': [c.character_name for c in characters],
            'openPeriods': [p.period_label for p in open_periods],
            'currentNight': open_periods[0].period_label if open_periods else None,
        }
    )


@bp.route('/characters/<string:name>/summary', methods=['GET'])
@require_bot_token
def character_summary(name: str):
    backend = _require_sheets()
    if backend:
        return backend

    char = sheets_client.get_character(name)
    if not char:
        return jsonify({'error': 'Character not found'}), 404

    totals = sheets_client.get_xp_totals(name)
    return jsonify(
        {
            'characterName': char.character_name,
            'earnedXp': totals['earned_xp'],
            'totalXp': totals['total_xp'],
            'totalSpends': totals['total_spends'] + totals['ledger_spent'],
            'availableXp': totals['available_xp'],
        }
    )


@bp.route('/claims', methods=['POST'])
@require_bot_token
def submit_claim():
    backend = _require_sheets()
    if backend:
        return backend

    payload = request.get_json(silent=True) or {}
    character_name = str(payload.get('characterName', '')).strip()
    play_period = str(payload.get('playPeriod', '')).strip()
    categories = payload.get('categories')

    if not character_name or not play_period or not isinstance(categories, dict):
        return jsonify({'error': 'characterName, playPeriod, and categories are required'}), 400

    char = sheets_client.get_character(character_name)
    if not char:
        return jsonify({'error': 'Character not found'}), 404

    if not char.active:
        return jsonify({'error': 'Character is inactive'}), 400

    period = next((p for p in _open_periods_desc() if p.period_label == play_period), None)
    if not period:
        return jsonify({'error': 'Play period is not open for submissions'}), 400

    normalized: dict[str, str] = {}
    for key, value in categories.items():
        if not isinstance(key, str):
            continue
        normalized[key.strip()] = str(value).strip() if value is not None else ''

    try:
        sheets_client.submit_xp_claim(character_name, play_period, normalized)
        sheets_client.log_action(
            staff_user='bot-api',
            action_type='bot_claim_submitted',
            target=character_name,
            details=f'Claim submitted for {play_period}',
        )
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    return jsonify({'ok': True, 'message': 'Claim submitted'}), 201


@bp.route('/spends', methods=['POST'])
@require_bot_token
def submit_spend():
    backend = _require_sheets()
    if backend:
        return backend

    payload = request.get_json(silent=True) or {}

    character_name = str(payload.get('characterName', '')).strip()
    spend_category = str(payload.get('spendCategory', '')).strip()
    trait_name = str(payload.get('traitName', '')).strip()
    justification = str(payload.get('justification', '')).strip()

    if not character_name or not spend_category or not trait_name or not justification:
        return jsonify({'error': 'characterName, spendCategory, traitName, and justification are required'}), 400

    try:
        current_dots = int(payload.get('currentDots', 0))
        new_dots = int(payload.get('newDots', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'currentDots and newDots must be integers'}), 400

    is_in_clan = bool(payload.get('isInClan', False))

    char = sheets_client.get_character(character_name)
    if not char:
        return jsonify({'error': 'Character not found'}), 404

    try:
        xp_cost = sheets_client.submit_spend_request(
            character_name=character_name,
            spend_category=spend_category,
            trait_name=trait_name,
            current_dots=current_dots,
            new_dots=new_dots,
            is_in_clan=is_in_clan,
            justification=justification,
        )
        sheets_client.log_action(
            staff_user='bot-api',
            action_type='bot_spend_submitted',
            target=character_name,
            details=(
                f'{spend_category}: {trait_name} ({current_dots}->{new_dots}) '
                f'for {xp_cost} XP'
            ),
        )
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    return jsonify({'ok': True, 'message': 'Spend request submitted', 'xpCost': xp_cost}), 201
