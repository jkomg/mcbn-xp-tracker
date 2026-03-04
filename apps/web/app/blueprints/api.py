"""Bot-facing API routes.

These endpoints are intended for Discord bot integration and use a shared
bearer token (`WEB_APP_API_TOKEN`) separate from staff Discord OAuth.
"""

from __future__ import annotations

import hmac
import re
import threading
import time
from datetime import datetime, timezone
from functools import wraps

from flask import Blueprint, current_app, jsonify, request

from app import sheets_client, limiter
from app.auth import is_allowed_discord_user

bp = Blueprint('api', __name__)
_seen_nonces: dict[str, int] = {}
_seen_nonces_lock = threading.Lock()
DISCORD_ID_RE = re.compile(r'^\d{17,20}$')


def _parse_review_date_epoch(value: str) -> int:
    raw = str(value or '').strip()
    if not raw:
        return 0
    try:
        dt = datetime.strptime(raw, '%Y%m%d %H:%M:%S').replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except ValueError:
        return 0


def _limit(rule: str):
    if limiter is None:
        return lambda f: f
    return limiter.limit(rule)


def _auth_failed():
    return jsonify({'error': 'Unauthorized'}), 401


def _forbidden(message: str = 'Forbidden'):
    return jsonify({'error': message}), 403


def _configured_tokens() -> dict[str, str]:
    return {
        'legacy': current_app.config.get('WEB_APP_API_TOKEN', ''),
        'read': current_app.config.get('WEB_APP_API_READ_TOKEN', ''),
        'write': current_app.config.get('WEB_APP_API_WRITE_TOKEN', ''),
    }


def _provided_bearer_token() -> str:
    header = request.headers.get('Authorization', '')
    if not header.startswith('Bearer '):
        return ''
    return header.split(' ', 1)[1].strip()


def _token_scopes(provided: str) -> set[str]:
    tokens = _configured_tokens()
    scopes: set[str] = set()
    if tokens['legacy'] and hmac.compare_digest(provided, tokens['legacy']):
        scopes.update({'read', 'write'})
    if tokens['read'] and hmac.compare_digest(provided, tokens['read']):
        scopes.add('read')
    if tokens['write'] and hmac.compare_digest(provided, tokens['write']):
        scopes.update({'read', 'write'})
    return scopes


def require_bot_scope(required_scope: str):
    if required_scope not in ('read', 'write'):
        raise ValueError(f'Invalid bot scope: {required_scope}')

    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            tokens = _configured_tokens()
            if not any(tokens.values()):
                return jsonify({'error': 'Bot API token not configured on server'}), 503

            provided = _provided_bearer_token()
            if not provided:
                return _auth_failed()

            scopes = _token_scopes(provided)
            if not scopes:
                return _auth_failed()
            if required_scope not in scopes:
                return _forbidden('Insufficient token scope')

            return f(*args, **kwargs)

        return decorated

    return decorator


def _enforce_replay_protection():
    if not current_app.config.get('BOT_API_REPLAY_PROTECTION_ENABLED', False):
        return None

    ts_header = request.headers.get('X-Request-Timestamp', '').strip()
    nonce = request.headers.get('X-Request-Nonce', '').strip()

    if not ts_header or not nonce:
        return jsonify({'error': 'Missing replay protection headers'}), 400

    try:
        req_ts = int(ts_header)
    except ValueError:
        return jsonify({'error': 'Invalid X-Request-Timestamp'}), 400

    now = int(time.time())
    window = int(current_app.config.get('BOT_API_REPLAY_WINDOW_SECONDS', 300))
    if abs(now - req_ts) > window:
        return jsonify({'error': 'Request timestamp outside allowed window'}), 400

    if len(nonce) > 128:
        return jsonify({'error': 'Invalid X-Request-Nonce'}), 400

    ttl = int(current_app.config.get('BOT_API_NONCE_TTL_SECONDS', 600))
    max_cache = int(current_app.config.get('BOT_API_NONCE_CACHE_SIZE', 10000))
    expiry = now + ttl

    with _seen_nonces_lock:
        expired = [key for key, exp in _seen_nonces.items() if exp <= now]
        for key in expired:
            _seen_nonces.pop(key, None)

        if nonce in _seen_nonces:
            return jsonify({'error': 'Replay detected'}), 409

        if len(_seen_nonces) >= max_cache:
            oldest = min(_seen_nonces, key=_seen_nonces.get)
            _seen_nonces.pop(oldest, None)

        _seen_nonces[nonce] = expiry

    return None


def require_replay_protection(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        error_response = _enforce_replay_protection()
        if error_response:
            return error_response

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


def _requester_from_query():
    requester_discord_id = str(request.args.get('requesterDiscordId', '')).strip()
    requester_discord_name = str(request.args.get('requesterDiscordName', '')).strip()
    if not requester_discord_id:
        return None, None, None, None, None, (jsonify({'error': 'requesterDiscordId is required'}), 400)
    if not DISCORD_ID_RE.fullmatch(requester_discord_id):
        return None, None, None, None, None, (jsonify({'error': 'requesterDiscordId must be a Discord snowflake'}), 400)
    test_mode = str(request.args.get('testMode', '')).strip().lower() in {'1', 'true', 'yes', 'on'}
    test_as_discord_id = str(request.args.get('testAsDiscordId', '')).strip()
    effective_discord_id, effective_name, error = _resolve_effective_requester(
        requester_discord_id=requester_discord_id,
        requester_discord_name=requester_discord_name,
        test_mode=test_mode,
        test_as_discord_id=test_as_discord_id,
    )
    if error:
        return None, None, None, None, None, error
    return requester_discord_id, requester_discord_name, effective_discord_id, effective_name, test_mode, None


def _requester_from_payload(payload: dict):
    requester_discord_id = str(payload.get('requesterDiscordId', '')).strip()
    requester_discord_name = str(payload.get('requesterDiscordName', '')).strip()
    if not requester_discord_id:
        return None, None, None, None, None, (jsonify({'error': 'requesterDiscordId is required'}), 400)
    if not DISCORD_ID_RE.fullmatch(requester_discord_id):
        return None, None, None, None, None, (jsonify({'error': 'requesterDiscordId must be a Discord snowflake'}), 400)
    test_mode = str(payload.get('testMode', '')).strip().lower() in {'1', 'true', 'yes', 'on'}
    test_as_discord_id = str(payload.get('testAsDiscordId', '')).strip()
    effective_discord_id, effective_name, error = _resolve_effective_requester(
        requester_discord_id=requester_discord_id,
        requester_discord_name=requester_discord_name,
        test_mode=test_mode,
        test_as_discord_id=test_as_discord_id,
    )
    if error:
        return None, None, None, None, None, error
    return requester_discord_id, requester_discord_name, effective_discord_id, effective_name, test_mode, None


def _is_requester_staff(requester_discord_id: str) -> bool:
    return is_allowed_discord_user(requester_discord_id)


def _requester_can_access_character(char, requester_discord_id: str, allow_staff_bypass: bool = True) -> bool:
    if allow_staff_bypass and _is_requester_staff(requester_discord_id):
        return True
    return str(char.player_discord or '').strip() == requester_discord_id


def _resolve_effective_requester(
    requester_discord_id: str,
    requester_discord_name: str,
    test_mode: bool,
    test_as_discord_id: str,
):
    if not test_mode:
        return requester_discord_id, requester_discord_name, None

    if not _is_requester_staff(requester_discord_id):
        return None, None, _forbidden('Test mode is staff-only')

    effective_discord_id = test_as_discord_id or requester_discord_id
    if not DISCORD_ID_RE.fullmatch(effective_discord_id):
        return None, None, (jsonify({'error': 'testAsDiscordId must be a Discord snowflake'}), 400)

    if test_as_discord_id and test_as_discord_id != requester_discord_id:
        effective_name = f'test-as:{test_as_discord_id}'
    else:
        effective_name = requester_discord_name
    return effective_discord_id, effective_name, None


@bp.route('/health', methods=['GET'])
def health():
    return jsonify({'ok': True})


@bp.route('/meta/claim-context', methods=['GET'])
@require_bot_scope('read')
@_limit("60 per minute")
def claim_context():
    backend = _require_sheets()
    if backend:
        return backend
    requester_discord_id, _, effective_discord_id, _, test_mode, error = _requester_from_query()
    if error:
        return error

    if (not test_mode) and effective_discord_id == requester_discord_id and _is_requester_staff(requester_discord_id):
        characters = sheets_client.get_active_characters()
    else:
        characters = [c for c in sheets_client.get_characters_by_discord_id(effective_discord_id) if c.active]
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
@require_bot_scope('read')
@_limit("60 per minute")
def character_summary(name: str):
    backend = _require_sheets()
    if backend:
        return backend
    _, _, effective_discord_id, _, test_mode, error = _requester_from_query()
    if error:
        return error

    char = sheets_client.get_character(name)
    if not char:
        return jsonify({'error': 'Character not found'}), 404
    if not _requester_can_access_character(char, effective_discord_id, allow_staff_bypass=not test_mode):
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


@bp.route('/review-events', methods=['GET'])
@require_bot_scope('read')
@_limit("30 per minute")
def review_events():
    backend = _require_sheets()
    if backend:
        return backend

    try:
        limit = int(request.args.get('limit', '100'))
    except (TypeError, ValueError):
        return jsonify({'error': 'limit must be an integer'}), 400
    if limit < 1 or limit > 500:
        return jsonify({'error': 'limit must be between 1 and 500'}), 400

    try:
        since_epoch = int(request.args.get('sinceEpoch', '0'))
    except (TypeError, ValueError):
        return jsonify({'error': 'sinceEpoch must be an integer'}), 400
    if since_epoch < 0:
        return jsonify({'error': 'sinceEpoch must be non-negative'}), 400

    events = []

    for claim in sheets_client.get_all_claims():
        status = str(claim.status or '').strip().lower()
        if status not in {'approved', 'denied'}:
            continue
        reviewed_epoch = _parse_review_date_epoch(claim.review_date)
        if reviewed_epoch <= since_epoch:
            continue
        events.append(
            {
                'eventKey': f'claim:{claim.row_index}:{status}:{reviewed_epoch}',
                'kind': 'claim',
                'rowIndex': claim.row_index,
                'characterName': claim.character_name,
                'status': status,
                'reviewedBy': claim.reviewed_by,
                'reviewDate': claim.review_date,
                'reviewedAtEpoch': reviewed_epoch,
                'staffNotes': claim.st_notes,
                'playPeriod': claim.play_period,
                'requestedXp': claim.xp_claimed,
                'approvedXp': claim.approved_xp,
            }
        )

    for spend in sheets_client.get_all_spends():
        status = str(spend.status or '').strip().lower()
        if status not in {'approved', 'denied'}:
            continue
        reviewed_epoch = _parse_review_date_epoch(spend.review_date)
        if reviewed_epoch <= since_epoch:
            continue
        events.append(
            {
                'eventKey': f'spend:{spend.row_index}:{status}:{reviewed_epoch}',
                'kind': 'spend',
                'rowIndex': spend.row_index,
                'characterName': spend.character_name,
                'status': status,
                'reviewedBy': spend.reviewed_by,
                'reviewDate': spend.review_date,
                'reviewedAtEpoch': reviewed_epoch,
                'staffNotes': spend.st_notes,
                'spendCategory': spend.spend_category,
                'traitName': spend.trait_name,
                'currentDots': spend.current_dots,
                'newDots': spend.new_dots,
                'requestedCost': spend.xp_cost,
                'verifiedCost': spend.verified_cost,
            }
        )

    events.sort(key=lambda e: (e['reviewedAtEpoch'], e['eventKey']))
    if len(events) > limit:
        events = events[-limit:]

    return jsonify({'events': events})


@bp.route('/claims', methods=['POST'])
@require_bot_scope('write')
@require_replay_protection
@_limit("20 per minute")
def submit_claim():
    backend = _require_sheets()
    if backend:
        return backend

    payload = request.get_json(silent=True) or {}
    requester_discord_id, requester_discord_name, effective_discord_id, effective_name, test_mode, error = _requester_from_payload(payload)
    if error:
        return error
    character_name = str(payload.get('characterName', '')).strip()
    play_period = str(payload.get('playPeriod', '')).strip()
    categories = payload.get('categories')

    if not character_name or not play_period or not isinstance(categories, dict):
        return jsonify({'error': 'characterName, playPeriod, and categories are required'}), 400

    char = sheets_client.get_character(character_name)
    if not char:
        return jsonify({'error': 'Character not found'}), 404
    if not _requester_can_access_character(char, effective_discord_id, allow_staff_bypass=not test_mode):
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
    if len(normalized) > 20:
        return jsonify({'error': 'Too many claim categories in payload'}), 400

    try:
        sheets_client.submit_xp_claim(character_name, play_period, normalized)
        sheets_client.log_action(
            staff_user=f'bot-api:{requester_discord_id}',
            action_type='bot_claim_submitted',
            target=character_name,
            details=(
                f'Claim submitted for {play_period} by '
                f'{effective_name or requester_discord_name or requester_discord_id}'
            ),
        )
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    return jsonify({'ok': True, 'message': 'Claim submitted'}), 201


@bp.route('/spends', methods=['POST'])
@require_bot_scope('write')
@require_replay_protection
@_limit("20 per minute")
def submit_spend():
    backend = _require_sheets()
    if backend:
        return backend

    payload = request.get_json(silent=True) or {}
    requester_discord_id, requester_discord_name, effective_discord_id, effective_name, test_mode, error = _requester_from_payload(payload)
    if error:
        return error

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
    if current_dots < 0 or new_dots < 0 or new_dots > 10:
        return jsonify({'error': 'Dot ratings must be between 0 and 10'}), 400

    is_in_clan = bool(payload.get('isInClan', False))

    char = sheets_client.get_character(character_name)
    if not char:
        return jsonify({'error': 'Character not found'}), 404
    if not _requester_can_access_character(char, effective_discord_id, allow_staff_bypass=not test_mode):
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
            staff_user=f'bot-api:{requester_discord_id}',
            action_type='bot_spend_submitted',
            target=character_name,
            details=(
                f'{spend_category}: {trait_name} ({current_dots}->{new_dots}) '
                f'for {xp_cost} XP by {effective_name or requester_discord_name or requester_discord_id}'
            ),
        )
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    return jsonify({'ok': True, 'message': 'Spend request submitted', 'xpCost': xp_cost}), 201
