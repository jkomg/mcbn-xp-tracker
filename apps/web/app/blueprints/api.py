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
from app.app_settings import get_app_setting

from flask import Blueprint, current_app, jsonify, request

from app import db_service, sheets_sync, limiter
from app.auth import is_allowed_discord_user
from app.retirement_automation import (
    enqueue_retirement_job,
    is_retirement_job_ready,
    mark_retirement_jobs_wiki_synced,
    retirement_next_retry_at,
)

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
    if not get_app_setting('BOT_API_REPLAY_PROTECTION_ENABLED', False):
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
    window = get_app_setting('BOT_API_REPLAY_WINDOW_SECONDS', 300)
    if abs(now - req_ts) > window:
        return jsonify({'error': 'Request timestamp outside allowed window'}), 400

    if len(nonce) > 128:
        return jsonify({'error': 'Invalid X-Request-Nonce'}), 400

    ttl = get_app_setting('BOT_API_NONCE_TTL_SECONDS', 600)
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


def _require_db():
    if db_service is None:
        return jsonify({'error': 'Database backend is not configured'}), 503
    return None


def _open_periods_desc():
    periods = [p for p in db_service.get_all_periods() if p.submissions_open and p.active]
    periods.sort(key=lambda p: p.night_number, reverse=True)
    return periods


def _current_open_night():
    periods = _open_periods_desc()
    return periods[0] if periods else None


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
    backend = _require_db()
    if backend:
        return backend
    requester_discord_id, _, effective_discord_id, _, test_mode, error = _requester_from_query()
    if error:
        return error

    if (not test_mode) and effective_discord_id == requester_discord_id and _is_requester_staff(requester_discord_id):
        characters = db_service.get_active_characters()
    else:
        characters = [c for c in db_service.get_characters_by_discord_id(effective_discord_id) if c.active]
    characters.sort(key=lambda c: c.character_name.lower())
    open_periods = _open_periods_desc()

    return jsonify(
        {
            'activeCharacters': [c.character_name for c in characters],
            'openPeriods': [p.period_label for p in open_periods],
            'currentNight': open_periods[0].period_label if open_periods else None,
        }
    )


@bp.route('/meta/claim-reminder-targets', methods=['GET'])
@require_bot_scope('read')
@_limit("20 per minute")
def claim_reminder_targets():
    backend = _require_db()
    if backend:
        return backend

    open_periods = _open_periods_desc()
    if not open_periods:
        return jsonify({'currentNight': None, 'targets': []})

    current = open_periods[0]
    active_characters = db_service.get_active_characters()
    claims = db_service.get_all_claims()

    submitted_for_current = {
        str(c.character_name).strip().lower()
        for c in claims
        if str(c.play_period).strip() == current.period_label and str(c.status).strip().lower() != 'denied'
    }

    targets = []
    for char in active_characters:
        if not getattr(char, 'active', True):
            continue
        player_discord_id = str(char.player_discord or '').strip()
        if not DISCORD_ID_RE.fullmatch(player_discord_id):
            continue
        if char.character_name.strip().lower() in submitted_for_current:
            continue
        targets.append(
            {
                'discordId': player_discord_id,
                'characterName': char.character_name,
            }
        )
    targets.sort(key=lambda item: item['characterName'].lower())

    return jsonify({'currentNight': current.period_label, 'targets': targets})


@bp.route('/meta/active-roster', methods=['GET'])
@require_bot_scope('read')
@_limit("60 per minute")
def active_roster():
    backend = _require_db()
    if backend:
        return backend
    characters = db_service.get_active_characters()
    characters.sort(key=lambda c: c.character_name.lower())
    if request.args.get('includeChannelIds') == '1':
        from app.db import DbCharacter
        rows = DbCharacter.query.filter_by(active=True).order_by(DbCharacter.character_name).all()
        return jsonify({
            'characters': [
                {
                    'name': r.character_name,
                    'ticketChannelId': r.ticket_channel_id or None,
                }
                for r in rows
            ]
        })
    if request.args.get('includeDiscordIds') == '1':
        return jsonify({
            'characters': [
                {
                    'name': c.character_name,
                    'discordId': str(c.player_discord).strip() if c.player_discord else None,
                    'clan': c.clan or None,
                    'sect': c.sect or None,
                }
                for c in characters
            ]
        })
    return jsonify({'characters': [c.character_name for c in characters]})


@bp.route('/backgrounds/status', methods=['GET'])
@require_bot_scope('read')
@_limit("60 per minute")
def backgrounds_status():
    backend = _require_db()
    if backend:
        return backend

    _, _, effective_discord_id, _, _, error = _requester_from_query()
    if error:
        return error

    character_name = str(request.args.get('characterName', '')).strip()
    if not character_name:
        return jsonify({'error': 'characterName is required'}), 400

    char = db_service.get_character(character_name)
    if not char:
        return jsonify({'error': 'Character not found'}), 404
    if not _requester_can_access_character(char, effective_discord_id):
        return _forbidden()

    current_night = _current_open_night()
    backgrounds = db_service.get_character_backgrounds(character_name)
    return jsonify({
        'characterName': char.character_name,
        'currentNight': current_night.period_label if current_night else None,
        'currentNightNumber': current_night.night_number if current_night else None,
        'backgrounds': backgrounds,
    })


@bp.route('/backgrounds/blank', methods=['POST'])
@require_bot_scope('write')
@require_replay_protection
@_limit("30 per minute")
def blank_background():
    backend = _require_db()
    if backend:
        return backend

    payload = request.get_json(silent=True) or {}
    _, _, effective_discord_id, effective_discord_name, _, error = _requester_from_payload(payload)
    if error:
        return error

    character_name = str(payload.get('characterName', '')).strip()
    background_name = str(payload.get('backgroundName', '')).strip()
    try:
        dots = int(payload.get('dots', 1) or 1)
    except (TypeError, ValueError):
        return jsonify({'error': 'dots must be an integer'}), 400
    if not character_name:
        return jsonify({'error': 'characterName is required'}), 400
    if not background_name:
        return jsonify({'error': 'backgroundName is required'}), 400
    if dots <= 0:
        return jsonify({'error': 'dots must be greater than 0'}), 400

    char = db_service.get_character(character_name)
    if not char:
        return jsonify({'error': 'Character not found'}), 404
    if not _requester_can_access_character(char, effective_discord_id):
        return _forbidden()

    # Donated backgrounds can only be blanked through coterie routes
    from app.db import DbCharacterBackground as _BgModel
    _bg_row = _BgModel.query.filter_by(
        character_name=char.character_name,
        background_name=background_name,
    ).first()
    if _bg_row and _bg_row.donated_coterie_id:
        return jsonify({'error': 'This background is donated to a coterie — use the coterie blanking route.'}), 409

    current_night = _current_open_night()
    if not current_night:
        return jsonify({'error': 'No active open night found'}), 409

    actor = f'bot:{effective_discord_name or effective_discord_id}'
    try:
        result = db_service.blank_character_background(
            char.character_name,
            background_name,
            dots,
            current_night.night_number,
            actor,
        )
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    db_service.log_action(
        staff_user=actor,
        action_type='bot_background_blank',
        target=char.character_name,
        details=(
            f'{result["background_name"]}: blanked {result["dots_blanked_now"]} dot(s), '
            f'release night {result["release_night_number"]}'
        ),
    )
    if sheets_sync:
        sheets_sync.sync_log_action(
            staff_user=actor,
            action_type='bot_background_blank',
            target=char.character_name,
            details=(
                f'{result["background_name"]}: blanked {result["dots_blanked_now"]} dot(s), '
                f'release night {result["release_night_number"]}'
            ),
        )

    return jsonify({
        'ok': True,
        'currentNight': current_night.period_label,
        'result': result,
    })


@bp.route('/backgrounds/release-due', methods=['POST'])
@require_bot_scope('write')
@require_replay_protection
@_limit("30 per minute")
def release_due_backgrounds():
    backend = _require_db()
    if backend:
        return backend

    current_night = _current_open_night()
    if not current_night:
        return jsonify({'ok': True, 'currentNight': None, 'released': []})

    released = db_service.release_due_background_blanks(current_night.night_number)
    for item in released:
        db_service.log_action(
            staff_user='system:background-release',
            action_type='background_blank_release',
            target=item.get('character_name', ''),
            details=(
                f'{item.get("background_name", "")}: released '
                f'{int(item.get("dots_released", 0))} dot(s) on {current_night.period_label}'
            ),
        )
    return jsonify({'ok': True, 'currentNight': current_night.period_label, 'released': released})


@bp.route('/characters/<string:name>/summary', methods=['GET'])
@require_bot_scope('read')
@_limit("60 per minute")
def character_summary(name: str):
    backend = _require_db()
    if backend:
        return backend
    _, _, effective_discord_id, _, test_mode, error = _requester_from_query()
    if error:
        return error

    char = db_service.get_character(name)
    if not char:
        return jsonify({'error': 'Character not found'}), 404
    if not _requester_can_access_character(char, effective_discord_id, allow_staff_bypass=not test_mode):
        return jsonify({'error': 'Character not found'}), 404

    totals = db_service.get_xp_totals(name)
    payload = {
        'characterName': char.character_name,
        'earnedXp': totals['earned_xp'],
        'totalXp': totals['total_xp'],
        'totalSpends': totals['total_spends'] + totals['ledger_spent'],
        'availableXp': totals['available_xp'],
    }

    if request.args.get('include_history') == '1':
        claims = db_service.get_claims_for_character(name)
        spends = db_service.get_spends_for_character(name)

        approved_claims = sorted(
            [c for c in claims if c.status.lower() == 'approved'],
            key=lambda c: c.review_date or c.timestamp or '',
            reverse=True,
        )[:10]
        approved_spends = sorted(
            [s for s in spends if s.status.lower() == 'approved'],
            key=lambda s: s.review_date or s.timestamp or '',
            reverse=True,
        )[:10]

        payload['recentClaims'] = [
            {
                'playPeriod': c.play_period,
                'approvedXp': c.approved_xp,
                'reviewDate': c.review_date or c.timestamp,
            }
            for c in approved_claims
        ]
        payload['recentSpends'] = [
            {
                'traitName': s.trait_name,
                'category': s.spend_category,
                'dots': f'{s.current_dots}→{s.new_dots}',
                'verifiedCost': s.verified_cost,
                'reviewDate': s.review_date or s.timestamp,
            }
            for s in approved_spends
        ]

    return jsonify(payload)


@bp.route('/submission-events', methods=['GET'])
@require_bot_scope('read')
@_limit("30 per minute")
def submission_events():
    """Return pending claims/spends submitted since sinceEpoch.

    Used by the bot's SubmissionNotifier to post staff-channel alerts when
    new claims or spends arrive.
    """
    backend = _require_db()
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
    since_event_key = str(request.args.get('sinceEventKey', '')).strip()

    discord_by_name: dict[str, str] = {}
    for char in db_service.get_all_characters():
        if char.player_discord:
            discord_by_name[char.character_name.lower()] = char.player_discord

    since_date_str = (
        datetime.fromtimestamp(since_epoch, tz=timezone.utc).strftime('%Y%m%d %H:%M:%S')
        if since_epoch > 0 else ''
    )

    events = []

    for claim in db_service.get_pending_claims_since(since_date_str):
        submitted_epoch = _parse_review_date_epoch(claim.timestamp)
        event_key = f'claim:{claim.row_index}:pending:{submitted_epoch}'
        if submitted_epoch == since_epoch:
            if not since_event_key or event_key <= since_event_key:
                continue
        events.append({
            'eventKey': event_key,
            'kind': 'claim',
            'rowIndex': claim.row_index,
            'characterName': claim.character_name,
            'playerDiscordId': discord_by_name.get(claim.character_name.lower(), ''),
            'submittedAt': claim.timestamp,
            'submittedAtEpoch': submitted_epoch,
            'playPeriod': claim.play_period,
            'requestedXp': claim.xp_claimed,
        })

    for spend in db_service.get_pending_spends_since(since_date_str):
        submitted_epoch = _parse_review_date_epoch(spend.timestamp)
        event_key = f'spend:{spend.row_index}:pending:{submitted_epoch}'
        if submitted_epoch == since_epoch:
            if not since_event_key or event_key <= since_event_key:
                continue
        events.append({
            'eventKey': event_key,
            'kind': 'spend',
            'rowIndex': spend.row_index,
            'characterName': spend.character_name,
            'playerDiscordId': discord_by_name.get(spend.character_name.lower(), ''),
            'submittedAt': spend.timestamp,
            'submittedAtEpoch': submitted_epoch,
            'spendCategory': spend.spend_category,
            'traitName': spend.trait_name,
            'currentDots': spend.current_dots,
            'newDots': spend.new_dots,
            'requestedCost': spend.xp_cost,
        })

    events.sort(key=lambda e: (e['submittedAtEpoch'], e['eventKey']))
    has_more = len(events) > limit
    if has_more:
        events = events[:limit]

    return jsonify({'events': events, 'hasMore': has_more})


@bp.route('/review-events', methods=['GET'])
@require_bot_scope('read')
@_limit("30 per minute")
def review_events():
    backend = _require_db()
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
    since_event_key = str(request.args.get('sinceEventKey', '')).strip()

    # Build character-name → Discord-ID lookup for player pings.
    discord_by_name: dict[str, str] = {}
    for char in db_service.get_all_characters():
        if char.player_discord:
            discord_by_name[char.character_name.lower()] = char.player_discord

    # Convert since_epoch to the stored date format so filtering happens in the DB.
    since_date_str = (
        datetime.fromtimestamp(since_epoch, tz=timezone.utc).strftime('%Y%m%d %H:%M:%S')
        if since_epoch > 0 else ''
    )

    events = []

    for claim in db_service.get_reviewed_claims_since(since_date_str):
        status = str(claim.status or '').strip().lower()
        reviewed_epoch = _parse_review_date_epoch(claim.review_date)
        event_key = f'claim:{claim.row_index}:{status}:{reviewed_epoch}'
        # Handle exact-epoch boundary: skip events at or before the cursor.
        if reviewed_epoch == since_epoch:
            if not since_event_key or event_key <= since_event_key:
                continue
        events.append(
            {
                'eventKey': event_key,
                'kind': 'claim',
                'rowIndex': claim.row_index,
                'characterName': claim.character_name,
                'playerDiscordId': discord_by_name.get(
                    claim.character_name.lower(), ''
                ),
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

    for spend in db_service.get_reviewed_spends_since(since_date_str):
        status = str(spend.status or '').strip().lower()
        reviewed_epoch = _parse_review_date_epoch(spend.review_date)
        event_key = f'spend:{spend.row_index}:{status}:{reviewed_epoch}'
        # Handle exact-epoch boundary: skip events at or before the cursor.
        if reviewed_epoch == since_epoch:
            if not since_event_key or event_key <= since_event_key:
                continue
        events.append(
            {
                'eventKey': event_key,
                'kind': 'spend',
                'rowIndex': spend.row_index,
                'characterName': spend.character_name,
                'playerDiscordId': discord_by_name.get(
                    spend.character_name.lower(), ''
                ),
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
    has_more = len(events) > limit
    if has_more:
        events = events[:limit]

    return jsonify({'events': events, 'hasMore': has_more})


@bp.route('/bot-config')
@require_bot_scope('read')
@_limit('10 per minute')
def bot_config():
    BOOL_KEYS = {
        'BOT_REVIEW_NOTIFIER_ENABLED': 'reviewNotifierEnabled',
        'BOT_SUBMISSION_NOTIFIER_ENABLED': 'submissionNotifierEnabled',
        'BOT_AUTO_PERIOD_CREATOR_ENABLED': 'autoPeriodCreatorEnabled',
        'BOT_AUTO_PERIOD_CLOSER_ENABLED': 'autoPeriodCloserEnabled',
        'BOT_CLAIM_REMINDER_ENABLED': 'claimReminderEnabled',
        'BOT_PASSAGE_OF_TIME_ENABLED': 'passageOfTimeEnabled',
        'BOT_HUNT_CONSEQUENCE_ENABLED': 'huntConsequenceEnabled',
        'BOT_RESTART_REQUESTED': 'restartRequested',
        'BOT_WIKI_SYNC_REQUESTED': 'wikiSyncRequested',
        'BOT_CC_TICKET_MONITOR_ENABLED': 'ccTicketMonitorEnabled',
        'BOT_HONEYPOT_ENABLED': 'honeypotEnabled',
        'BOT_HONEYPOT_REQUIRE_YOUNG_ACCOUNT': 'honeypotRequireYoungAccount',
        'BOT_MENTION_BREAKER_ENABLED': 'mentionBreakerEnabled',
        'BOT_NEW_MEMBER_GATE_ENABLED': 'newMemberGateEnabled',
        'BOT_NEW_NIGHT_BROADCAST_ENABLED': 'newNightBroadcastEnabled',
    }
    INT_KEYS = {
        'BOT_PASSAGE_OF_TIME_INTERVAL_MS': 'passageOfTimeIntervalMs',
        'BOT_REVIEW_NOTIFIER_INTERVAL_MS': 'reviewNotifierIntervalMs',
        'BOT_SUBMISSION_NOTIFIER_INTERVAL_MS': 'submissionNotifierIntervalMs',
        'BOT_CLAIM_REMINDER_INTERVAL_MS': 'claimReminderIntervalMs',
        'BOT_HONEYPOT_MAX_ACCOUNT_AGE_DAYS': 'honeypotMaxAccountAgeDays',
        'BOT_MENTION_BREAKER_MAX_MENTIONS': 'mentionBreakerMaxMentions',
        'BOT_MENTION_BREAKER_TIMEOUT_MINUTES': 'mentionBreakerTimeoutMinutes',
    }
    STR_KEYS = {
        'BOT_ANNOUNCEMENTS_CHANNEL_ID': 'announcementsChannelId',
        'BOT_CC_TICKET_CATEGORY_IDS': 'ccTicketCategoryIds',
        'BOT_HONEYPOT_CHANNEL_ID': 'honeypotChannelId',
        'BOT_HONEYPOT_MOD_LOG_CHANNEL_ID': 'honeypotModLogChannelId',
        'BOT_HONEYPOT_WHITELISTED_ROLE_IDS': 'honeypotWhitelistedRoleIds',
        'BOT_MENTION_BREAKER_EXEMPT_ROLE_IDS': 'mentionBreakerExemptRoleIds',
        'BOT_MENTION_BREAKER_MOD_LOG_CHANNEL_ID': 'mentionBreakerModLogChannelId',
        'BOT_VERIFIED_MEMBER_ROLE_ID': 'verifiedMemberRoleId',
        'BOT_NEW_MEMBER_GATE_WELCOME_CHANNEL_ID': 'newMemberGateWelcomeChannelId',
        'BOT_NEW_MEMBER_GATE_SHEET_IN_PROGRESS_ROLE_ID': 'newMemberGateSheetInProgressRoleId',
        'BOT_NEW_MEMBER_GATE_LURKER_ROLE_ID': 'newMemberGateLurkerRoleId',
        'BOT_NEW_NIGHT_BROADCAST_MESSAGE': 'newNightBroadcastMessage',
        'BOT_DISABLED_COMMANDS': 'disabledCommands',
        'BOT_CORRESPONDENCE_DELIVERY_CHANNEL_ID': 'correspondenceDeliveryChannelId',
        'BOT_CORRESPONDENCE_CONTACT_CHANNEL_ID': 'correspondenceContactChannelId',
        'BOT_CORRESPONDENCE_PRESTATION_CHANNEL_ID': 'correspondencePrestationChannelId',
        'BOT_CORRESPONDENCE_SOCIAL_CHANNEL_ID': 'correspondenceSocialChannelId',
        'BOT_CORRESPONDENCE_COBWEB_CHANNEL_ID': 'correspondenceCobwebChannelId',
        'BOT_CORRESPONDENCE_RUMOR_CHANNEL_ID': 'correspondenceRumorChannelId',
    }
    all_keys = list(BOOL_KEYS) + list(INT_KEYS) + list(STR_KEYS)
    from app.db import AppSetting
    records = {r.key: r for r in AppSetting.query.filter(AppSetting.key.in_(all_keys)).all()}
    result = {}
    for db_key, api_key in BOOL_KEYS.items():
        record = records.get(db_key)
        result[api_key] = None if record is None else record.value.lower() in ('true', '1', 'yes')
    for db_key, api_key in INT_KEYS.items():
        record = records.get(db_key)
        if record is None:
            result[api_key] = None
        else:
            try:
                result[api_key] = int(record.value)
            except (ValueError, TypeError):
                result[api_key] = None
    for db_key, api_key in STR_KEYS.items():
        record = records.get(db_key)
        result[api_key] = record.value.strip() if record else None
    # Include all staff Discord IDs from the DB so the bot can use them for local auth checks
    staff_rows = AppSetting.query.filter(AppSetting.key.like('STAFF_MEMBER_%')).all()
    result['staffDiscordIds'] = [row.key[len('STAFF_MEMBER_'):] for row in staff_rows]
    return jsonify(result)


@bp.route('/bot-restart-ack', methods=['POST'])
@require_bot_scope('write')
@_limit('10 per minute')
def bot_restart_ack():
    """Bot calls this to clear the restart-requested flag just before exiting."""
    from app.db import AppSetting, db
    record = db.session.get(AppSetting, 'BOT_RESTART_REQUESTED')
    if record:
        db.session.delete(record)
        db.session.commit()
    return jsonify({'ok': True})


@bp.route('/bot-heartbeat', methods=['POST'])
@require_bot_scope('write')
@_limit('120 per minute')
def bot_heartbeat_post():
    from datetime import datetime, timezone
    from app.db import db
    from sqlalchemy import text
    ts = datetime.now(timezone.utc).isoformat()

    # Use upsert (INSERT ... ON CONFLICT DO UPDATE) for all settings so that
    # concurrent Cloud Run instances don't trigger SQLAlchemy StaleDataError
    # from executemany() rowcount mismatches on the Turso HTTP driver.
    def _upsert(key, val):
        db.session.execute(
            text(
                "INSERT INTO app_settings (key, value, updated_by, updated_at)"
                " VALUES (:key, :val, 'bot', :ts)"
                " ON CONFLICT(key) DO UPDATE SET"
                " value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at"
            ),
            {'key': key, 'val': val, 'ts': ts},
        )

    _upsert('BOT_LAST_HEARTBEAT', ts)

    # Store live flag state reported by the bot so the settings page can show
    # what the bot is actually doing, regardless of DB overrides or .env defaults.
    LIVE_FLAG_KEYS = {
        'reviewNotifierEnabled': 'BOT_LIVE_REVIEW_NOTIFIER_ENABLED',
        'submissionNotifierEnabled': 'BOT_LIVE_SUBMISSION_NOTIFIER_ENABLED',
        'autoPeriodCreatorEnabled': 'BOT_LIVE_AUTO_PERIOD_CREATOR_ENABLED',
        'autoPeriodCloserEnabled': 'BOT_LIVE_AUTO_PERIOD_CLOSER_ENABLED',
        'claimReminderEnabled': 'BOT_LIVE_CLAIM_REMINDER_ENABLED',
        'passageOfTimeEnabled': 'BOT_LIVE_PASSAGE_OF_TIME_ENABLED',
        'huntConsequenceEnabled': 'BOT_LIVE_HUNT_CONSEQUENCE_ENABLED',
        'wikiSyncCapable': 'BOT_LIVE_WIKI_SYNC_CAPABLE',
        'ccTicketMonitorEnabled': 'BOT_LIVE_CC_TICKET_MONITOR_ENABLED',
    }
    body = request.get_json(silent=True) or {}
    for field, db_key in LIVE_FLAG_KEYS.items():
        if field in body:
            _upsert(db_key, 'true' if body[field] else 'false')

    db.session.commit()
    return jsonify({'ok': True})


@bp.route('/bot-heartbeat', methods=['GET'])
@require_bot_scope('read')
@_limit('60 per minute')
def bot_heartbeat_get():
    from datetime import datetime, timezone
    from app.db import AppSetting, db
    record = db.session.get(AppSetting, 'BOT_LAST_HEARTBEAT')
    if not record:
        return jsonify({'last_heartbeat': None, 'age_seconds': None})
    ts = record.value
    try:
        last = datetime.fromisoformat(ts)
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        age = int((datetime.now(timezone.utc) - last).total_seconds())
    except ValueError:
        age = None
    return jsonify({'last_heartbeat': ts, 'age_seconds': age})


@bp.route('/periods/auto-create', methods=['POST'])
@require_bot_scope('write')
@require_replay_protection
@_limit("10 per minute")
def auto_create_period():
    backend = _require_db()
    if backend:
        return backend

    if not get_app_setting('AUTO_CREATE_PERIODS_ENABLED', False):
        return jsonify({'created': False, 'reason': 'disabled'}), 200

    result = db_service.auto_create_next_period_if_due(
        open_lead_days=get_app_setting('AUTO_CREATE_PERIODS_OPEN_LEAD_DAYS', 1),
        default_length_days=get_app_setting('AUTO_CREATE_PERIODS_DEFAULT_LENGTH_DAYS', 14),
        default_gap_days=get_app_setting('AUTO_CREATE_PERIODS_DEFAULT_GAP_DAYS', 0),
    )
    period = result.get('period')
    if result.get('created') and period:
        db_service.log_action(
            staff_user='bot-api:auto-period',
            action_type='auto_create_period',
            target=period.period_label,
            details=f'Automatically created {period.period_label}',
        )
        if sheets_sync:
            sheets_sync.sync_create_period(period)
            sheets_sync.sync_log_action(
                staff_user='bot-api:auto-period',
                action_type='auto_create_period',
                target=period.period_label,
                details=f'Automatically created {period.period_label}',
            )
        return jsonify(
            {
                'created': True,
                'reason': 'created',
                'periodLabel': period.period_label,
                'nightNumber': period.night_number,
            }
        ), 201

    return jsonify(
        {
            'created': False,
            'reason': result.get('reason', 'skipped'),
        }
    ), 200


@bp.route('/periods/auto-close', methods=['POST'])
@require_bot_scope('write')
@require_replay_protection
@_limit("10 per minute")
def auto_close_period():
    backend = _require_db()
    if backend:
        return backend

    if not get_app_setting('AUTO_CLOSE_PERIODS_ENABLED', False):
        return jsonify({'closed': False, 'reason': 'disabled'}), 200

    result = db_service.auto_close_period_if_due()
    period = result.get('period')
    if result.get('closed') and period:
        db_service.log_action(
            staff_user='bot-api:auto-period',
            action_type='auto_close_period',
            target=period.period_label,
            details=f'Automatically closed submissions for {period.period_label}',
        )
        if sheets_sync:
            sheets_sync.sync_log_action(
                staff_user='bot-api:auto-period',
                action_type='auto_close_period',
                target=period.period_label,
                details=f'Automatically closed submissions for {period.period_label}',
            )
        return jsonify({
            'closed': True,
            'reason': 'closed',
            'periodLabel': period.period_label,
            'nightNumber': period.night_number,
            'reminderTargets': result.get('reminder_targets', []),
        }), 200

    return jsonify({'closed': False, 'reason': result.get('reason', 'skipped')}), 200


@bp.route('/claims', methods=['POST'])
@require_bot_scope('write')
@require_replay_protection
@_limit("20 per minute")
def submit_claim():
    backend = _require_db()
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

    char = db_service.get_character(character_name)
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
        db_service.submit_xp_claim(character_name, play_period, normalized)
        if sheets_sync:
            sheets_sync.sync_add_claim(character_name, play_period, normalized)
        db_service.log_action(
            staff_user=f'bot-api:{requester_discord_id}',
            action_type='bot_claim_submitted',
            target=character_name,
            details=(
                f'Claim submitted for {play_period} by '
                f'{effective_name or requester_discord_name or requester_discord_id}'
            ),
        )
        if sheets_sync:
            sheets_sync.sync_log_action(
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
    backend = _require_db()
    if backend:
        return backend

    payload = request.get_json(silent=True) or {}
    requester_discord_id, requester_discord_name, effective_discord_id, effective_name, test_mode, error = _requester_from_payload(payload)
    if error:
        return error

    character_name = str(payload.get('characterName', '')).strip()
    spend_category = str(payload.get('spendCategory', '')).strip()
    trait_name = str(payload.get('traitName', '')).strip()
    power_name = str(payload.get('powerName', '')).strip()[:100]
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

    coterie_id: int | None = None
    raw_cid = payload.get('coterieId')
    if raw_cid is not None:
        try:
            coterie_id = int(raw_cid)
        except (TypeError, ValueError):
            return jsonify({'error': 'coterieId must be an integer'}), 400

    char = db_service.get_character(character_name)
    if not char:
        return jsonify({'error': 'Character not found'}), 404
    if not _requester_can_access_character(char, effective_discord_id, allow_staff_bypass=not test_mode):
        return jsonify({'error': 'Character not found'}), 404

    try:
        xp_cost = db_service.submit_spend_request(
            character_name=character_name,
            spend_category=spend_category,
            trait_name=trait_name,
            power_name=power_name,
            current_dots=current_dots,
            new_dots=new_dots,
            is_in_clan=is_in_clan,
            justification=justification,
            coterie_id=coterie_id,
        )
        if sheets_sync:
            sheets_sync.sync_add_spend(
                character_name=character_name,
                spend_category=spend_category,
                trait_name=trait_name,
                current_dots=current_dots,
                new_dots=new_dots,
                is_in_clan=is_in_clan,
                justification=justification,
            )
        db_service.log_action(
            staff_user=f'bot-api:{requester_discord_id}',
            action_type='bot_spend_submitted',
            target=character_name,
            details=(
                f'{spend_category}: {trait_name} ({current_dots}->{new_dots}) '
                f'for {xp_cost} XP by {effective_name or requester_discord_name or requester_discord_id}'
            ),
        )
        if sheets_sync:
            sheets_sync.sync_log_action(
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



@bp.route('/reminder-prefs', methods=['GET'])
@require_bot_scope('read')
def get_reminder_prefs():
    """Return all reminder preferences (for the bot to load on startup)."""
    prefs = db_service.get_all_reminder_prefs()
    return jsonify({'preferences': prefs})


@bp.route('/reminder-prefs/<discord_id>', methods=['PUT'])
@require_bot_scope('write')
def set_reminder_pref(discord_id):
    """Upsert reminder preference for a Discord user."""
    if not discord_id or not discord_id.isdigit():
        return jsonify({'error': 'Invalid discord_id'}), 400
    data = request.get_json(silent=True) or {}
    opt_out = bool(data.get('optOut', False))
    snooze_until_epoch = int(data.get('snoozeUntilEpoch', 0))
    db_service.set_reminder_pref(discord_id, opt_out, snooze_until_epoch)
    return jsonify({'ok': True})


@bp.route('/wiki-sync-ack', methods=['POST'])
@require_bot_scope('write')
@_limit('30 per minute')
def wiki_sync_ack():
    """Bot calls this to report Wiki sync status."""
    from datetime import datetime, timezone
    from app.db import AppSetting, WikiSyncEvent, db
    data = request.get_json(silent=True) or {}
    status = data.get('status')
    if status not in ('running', 'success', 'error'):
        return jsonify({'error': 'status must be running, success, or error'}), 400
    source = str(data.get('source', 'manual')).strip().lower()
    if source not in ('manual', 'scheduled'):
        return jsonify({'error': 'source must be manual or scheduled'}), 400
    run_id = str(data.get('runId', '')).strip()
    if len(run_id) > 64:
        return jsonify({'error': 'runId must be at most 64 characters'}), 400
    now = datetime.now(timezone.utc).isoformat()

    def upsert(key, value):
        rec = db.session.get(AppSetting, key)
        if rec:
            rec.value = value
            rec.updated_at = datetime.now(timezone.utc)
            rec.updated_by = 'bot'
        else:
            db.session.add(AppSetting(key=key, value=value, updated_by='bot'))

    def delete_key(key):
        rec = db.session.get(AppSetting, key)
        if rec:
            db.session.delete(rec)

    if status == 'running':
        if source == 'manual':
            delete_key('BOT_WIKI_SYNC_REQUESTED')
        upsert('BOT_WIKI_SYNC_STATUS', 'running')
        upsert('BOT_WIKI_SYNC_SOURCE', source)
        if run_id:
            upsert('BOT_WIKI_SYNC_RUN_ID', run_id)
        else:
            delete_key('BOT_WIKI_SYNC_RUN_ID')
        upsert('BOT_WIKI_SYNC_STARTED_AT', now)
        delete_key('BOT_WIKI_SYNC_FINISHED_AT')
        delete_key('BOT_WIKI_SYNC_ERROR')
        retirement_jobs_synced = 0
    elif status == 'success':
        upsert('BOT_WIKI_SYNC_STATUS', 'success')
        upsert('BOT_WIKI_SYNC_SOURCE', source)
        if run_id:
            upsert('BOT_WIKI_SYNC_RUN_ID', run_id)
        else:
            delete_key('BOT_WIKI_SYNC_RUN_ID')
        upsert('BOT_WIKI_SYNC_FINISHED_AT', now)
        delete_key('BOT_WIKI_SYNC_ERROR')
        # Only mark jobs whose Discord work completed before this sync started.
        # Guard: only use BOT_WIKI_SYNC_STARTED_AT if its run id matches this
        # request's runId — if the running ack failed, the stored timestamp may
        # belong to a previous run and would incorrectly exclude jobs processed
        # by the current sync.
        sync_started_dt: datetime | None = None
        if run_id:
            run_id_rec = db.session.get(AppSetting, 'BOT_WIKI_SYNC_RUN_ID')
            stored_run_id = (run_id_rec.value if run_id_rec else '') or ''
            if stored_run_id == run_id:
                sync_started_rec = db.session.get(AppSetting, 'BOT_WIKI_SYNC_STARTED_AT')
                if sync_started_rec and sync_started_rec.value:
                    try:
                        sync_started_dt = datetime.fromisoformat(sync_started_rec.value)
                        if sync_started_dt.tzinfo is None:
                            sync_started_dt = sync_started_dt.replace(tzinfo=timezone.utc)
                    except ValueError:
                        pass
        retirement_jobs_synced = mark_retirement_jobs_wiki_synced(synced_before=sync_started_dt)
    else:
        upsert('BOT_WIKI_SYNC_STATUS', 'error')
        upsert('BOT_WIKI_SYNC_SOURCE', source)
        if run_id:
            upsert('BOT_WIKI_SYNC_RUN_ID', run_id)
        else:
            delete_key('BOT_WIKI_SYNC_RUN_ID')
        upsert('BOT_WIKI_SYNC_FINISHED_AT', now)
        upsert('BOT_WIKI_SYNC_ERROR', data.get('error', 'unknown error'))
        retirement_jobs_synced = 0

    db.session.add(
        WikiSyncEvent(
            ts=now,
            run_id=run_id,
            source=source,
            status=status,
            error=(str(data.get('error') or '')[:2000]),
            created_at=datetime.now(timezone.utc),
        )
    )
    db.session.commit()

    # Keep a bounded sync history to avoid unbounded growth.
    cutoff_query = (
        db.session.query(WikiSyncEvent.id)
        .order_by(WikiSyncEvent.created_at.desc())
        .offset(500)
        .limit(1)
        .scalar()
    )
    if cutoff_query:
        db.session.query(WikiSyncEvent).filter(WikiSyncEvent.id <= cutoff_query).delete()
        db.session.commit()

    return jsonify({'ok': True, 'retirementJobsSynced': retirement_jobs_synced})


@bp.route('/bot-log', methods=['POST'])
@require_bot_scope('write')
@_limit('120 per minute')
def bot_log():
    """Bot forwards its warn/error log entries here for persistent storage."""
    from datetime import datetime, timezone
    from app.db import AppLogEntry, db
    from app.discord_alert import send_escalation_alert, check_escalation, dashboard_link
    from flask import current_app
    entries = request.get_json(silent=True) or []
    if not isinstance(entries, list):
        return jsonify({'error': 'expected a JSON array'}), 400
    now = datetime.now(timezone.utc)
    webhook_url = current_app.config.get('DISCORD_WEBHOOK_URL', '')
    redirect_uri = current_app.config.get('DISCORD_REDIRECT_URI', '')
    # (dedupe_key, message, details, link) — checked for escalation after
    # commit, once each row's own count is stable to query.
    pending_escalation_checks = []
    for raw in entries[:100]:
        if not isinstance(raw, dict):
            continue
        level = str(raw.get('level', '')).lower()
        if level not in ('warn', 'error'):
            continue
        ts = str(raw.get('ts', now.isoformat()))
        event = str(raw.get('event', 'unknown'))[:200]
        msg = str(raw.get('error') or raw.get('reason') or raw.get('message') or '')
        context = {k: v for k, v in raw.items() if k not in ('ts', 'level', 'event', 'error', 'reason', 'message')}
        import json as _json
        details = _json.dumps(context, ensure_ascii=False) if context else ''
        # Some bot events recur per-character/per-channel (e.g. a review
        # notifier that can't resolve a cubby channel). Deduping on event
        # name alone would let the first character's occurrences suppress
        # every other distinct character hitting the same event. Events with
        # no subject (e.g. wiki_sync_scheduled_failed) fall back to plain
        # event-level grouping — never leave dedupe_key empty, or these lose
        # escalation tracking entirely (check_escalation treats '' as "skip").
        subject = str(context.get('characterName') or context.get('channelName') or '')
        dedupe_key = f'bot:{event}:{subject}' if subject else f'bot:{event}'
        db.session.add(AppLogEntry(
            ts=ts, source='bot', level=level, event=event,
            message=msg[:2000], details=details[:4000], created_at=now,
            dedupe_key=dedupe_key,
        ))
        link = dashboard_link(redirect_uri, 'bot', level, event)
        pending_escalation_checks.append((dedupe_key, msg, details, link))
    db.session.commit()
    if webhook_url:
        # A batch can carry several rows sharing one dedupe_key (all committed
        # together, same timestamp) — checking each individually would see the
        # same final count every time and fire the same escalation once per
        # row. Aggregate to one check per distinct key, telling
        # check_escalation how many new rows this batch added for that key so
        # it can detect crossing a threshold multiple even when the batch
        # doesn't land exactly on one (prior count 4 + this batch's 2 = 6,
        # still past the 5-occurrence mark). Last row's context wins for the
        # "most recent" framing in the alert.
        by_key = {}
        for dedupe_key, msg, details, link in pending_escalation_checks:
            entry = by_key.setdefault(dedupe_key, {'n': 0})
            entry['n'] += 1
            entry['msg'] = msg
            entry['details'] = details
            entry['link'] = link
        for dedupe_key, info in by_key.items():
            count = check_escalation(dedupe_key, new_occurrences=info['n'])
            if count:
                send_escalation_alert(
                    webhook_url, dedupe_key, count, info['msg'],
                    details=info['details'], link=info['link'],
                )
    # Prune to 500 most recent entries
    cutoff_query = db.session.query(AppLogEntry.id).order_by(AppLogEntry.created_at.desc()).offset(500).limit(1).scalar()
    if cutoff_query:
        db.session.query(AppLogEntry).filter(AppLogEntry.id <= cutoff_query).delete()
        db.session.commit()
    return jsonify({'ok': True})


@bp.route('/wiki/page', methods=['POST'])
@require_bot_scope('write')
@_limit('120 per minute')
def upsert_wiki_page():
    """Create or update a wiki page (used by the Discord→Wiki sync script)."""
    from datetime import datetime, timezone
    from app.db import db, WikiPage
    data = request.get_json(silent=True) or {}
    slug = (data.get('slug') or '').strip()
    title = (data.get('title') or '').strip()
    if not slug or not title:
        return jsonify({'error': 'slug and title are required'}), 400

    from app.gcs import resolve_cover_url, mirror_markdown_images
    from flask import current_app as _app

    def _resolve_cover(url: str, page_slug: str) -> str:
        return resolve_cover_url(url, page_slug, _app.config)

    def _resolve_body(body: str, page_slug: str) -> str:
        return mirror_markdown_images(body, page_slug, _app.config)

    from app.db import WikiSyncBlock
    p = WikiPage.query.filter_by(slug=slug).first()
    if not p and WikiSyncBlock.query.filter_by(slug=slug).first():
        return jsonify({'status': 'sync_blocked', 'slug': slug})
    if p:
        if p.sync_locked:
            return jsonify({
                'status': 'locked',
                'slug': slug,
                'error': 'wiki page is sync-locked',
            }), 423
        p.title = title
        if 'body_markdown' in data:
            p.body_markdown = _resolve_body(data['body_markdown'], slug)
        if 'category' in data:
            p.category = data['category']
        if 'cover_image_url' in data:
            p.cover_image_url = _resolve_cover(data['cover_image_url'], slug)
        if 'published' in data:
            # Bot sync sends published bool; map to status only when page is
            # in a sync-managed state (draft/active). Upcoming/archived are
            # staff-managed and should not be overridden by the bot.
            if p.status in ('draft', 'active'):
                p.status = 'active' if data['published'] else 'draft'
        p.source = data.get('source', p.source)
        p.updated_by = data.get('updated_by', 'api-sync')
        p.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        return jsonify({'status': 'updated', 'slug': slug})

    p = WikiPage(
        slug=slug,
        title=title,
        body_markdown=_resolve_body(data.get('body_markdown', ''), slug),
        category=data.get('category', ''),
        cover_image_url=_resolve_cover(data.get('cover_image_url', ''), slug),
        source=data.get('source', 'api-sync'),
        status='active' if data.get('published', True) else 'draft',
        updated_by=data.get('updated_by', 'api-sync'),
    )
    db.session.add(p)
    db.session.commit()
    return jsonify({'status': 'created', 'slug': slug}), 201


@bp.route('/character/<name>/status', methods=['PUT'])
@require_bot_scope('write')
@_limit('120 per minute')
def set_character_status(name):
    """Set a character's status (active/deceased/retired) via the sync script."""
    from app.db import db, DbCharacter
    from sqlalchemy import func as _func
    data = request.get_json(silent=True) or {}
    new_status = data.get('status', '').strip().lower()
    if new_status not in ('active', 'deceased', 'retired'):
        return jsonify({'error': 'status must be active, deceased, or retired'}), 400
    row = DbCharacter.query.filter(
        _func.lower(DbCharacter.character_name) == name.lower()
    ).first()
    if not row:
        return jsonify({'error': 'character not found'}), 404
    previous_status = row.status or ('active' if row.active else 'retired')
    row.status = new_status
    row.active = (new_status == 'active')
    if previous_status != 'retired' and new_status == 'retired':
        enqueue_retirement_job(
            row.character_name,
            (data.get('requesterDiscordName') or 'bot').strip() or 'bot',
        )
    db.session.commit()
    return jsonify({'status': 'updated', 'character': row.character_name, 'new_status': new_status})


@bp.route('/retirement-automation/pending', methods=['GET'])
@require_bot_scope('read')
@_limit('120 per minute')
def get_pending_retirement_jobs():
    from app.db import RetirementAutomationJob
    rows = (
        RetirementAutomationJob.query
        .filter(RetirementAutomationJob.discord_completed_at.is_(None))
        .order_by(RetirementAutomationJob.requested_at.asc(), RetirementAutomationJob.id.asc())
        .all()
    )
    ready_rows = [row for row in rows if is_retirement_job_ready(row)]
    return jsonify({
        'jobs': [
            {
                'id': row.id,
                'characterName': row.character_name,
                'cubbyChannelId': row.cubby_channel_id,
                'requestedAt': row.requested_at.isoformat() if row.requested_at else None,
                'nextRetryAt': retirement_next_retry_at(row).isoformat() if retirement_next_retry_at(row) else None,
            }
            for row in ready_rows
        ]
    })


@bp.route('/retirement-automation/<int:job_id>/discord-complete', methods=['POST'])
@require_bot_scope('write')
@_limit('120 per minute')
def mark_retirement_job_discord_complete(job_id: int):
    from app.db import RetirementAutomationJob, db
    data = request.get_json(silent=True) or {}
    row = db.session.get(RetirementAutomationJob, job_id)
    if not row:
        return jsonify({'error': 'retirement job not found'}), 404

    now = datetime.now(timezone.utc)
    row.last_attempt_at = now
    row.attempt_count = int(row.attempt_count or 0) + 1
    row.cubby_channel_id = (data.get('cubbyChannelId') or row.cubby_channel_id or None)
    row.children_source_thread_id = (data.get('childrenSourceThreadId') or row.children_source_thread_id or None)
    row.children_retired_thread_id = (data.get('childrenRetiredThreadId') or row.children_retired_thread_id or None)
    row.cubby_moved_at = now
    row.children_moved_at = now
    row.discord_completed_at = now
    row.last_error = ''
    db.session.commit()
    return jsonify({'ok': True})


@bp.route('/retirement-automation/<int:job_id>/discord-failed', methods=['POST'])
@require_bot_scope('write')
@_limit('120 per minute')
def mark_retirement_job_discord_failed(job_id: int):
    from app.db import RetirementAutomationJob, db
    data = request.get_json(silent=True) or {}
    row = db.session.get(RetirementAutomationJob, job_id)
    if not row:
        return jsonify({'error': 'retirement job not found'}), 404

    error = str(data.get('error') or '').strip()
    if not error:
        return jsonify({'error': 'error is required'}), 400

    now = datetime.now(timezone.utc)
    row.last_attempt_at = now
    row.attempt_count = int(row.attempt_count or 0) + 1
    row.cubby_moved_at = None
    row.children_moved_at = None
    row.discord_completed_at = None
    row.children_source_thread_id = None
    row.children_retired_thread_id = None
    row.last_error = error[:4000]
    db.session.commit()
    return jsonify({'ok': True})


@bp.route('/retirement-automation/wiki-batch-request', methods=['POST'])
@require_bot_scope('write')
@_limit('30 per minute')
def request_retirement_wiki_batch():
    from app.db import AppSetting, RetirementAutomationJob, db

    pending_count = RetirementAutomationJob.query.filter(
        RetirementAutomationJob.discord_completed_at.is_not(None),
        RetirementAutomationJob.wiki_synced_at.is_(None),
    ).count()
    if pending_count == 0:
        return jsonify({'ok': True, 'requested': False, 'pendingCount': 0, 'reason': 'no_pending_jobs'})

    record = db.session.get(AppSetting, 'BOT_WIKI_SYNC_REQUESTED')
    if record:
        return jsonify({'ok': True, 'requested': False, 'pendingCount': pending_count, 'reason': 'already_requested'})

    db.session.add(AppSetting(
        key='BOT_WIKI_SYNC_REQUESTED',
        value='true',
        updated_by='retirement-automation',
    ))
    db.session.commit()
    return jsonify({'ok': True, 'requested': True, 'pendingCount': pending_count})


@bp.route('/wiki/page/<slug>', methods=['DELETE'])
@require_bot_scope('write')
@_limit('120 per minute')
def delete_wiki_page(slug):
    """Delete a wiki page by slug (used by the sync script for cleanup)."""
    from app.db import db, WikiPage
    p = WikiPage.query.filter_by(slug=slug).first()
    if not p:
        return jsonify({'status': 'not_found', 'slug': slug}), 404
    if p.sync_locked:
        return jsonify({
            'status': 'locked',
            'slug': slug,
            'error': 'wiki page is sync-locked',
        }), 423
    db.session.delete(p)
    db.session.commit()
    return jsonify({'status': 'deleted', 'slug': slug})


@bp.route('/roster/character/<name>', methods=['GET'])
@require_bot_scope('read')
@_limit('120 per hour')
def get_character_api(name):
    """Return current details for a character by name."""
    char = db_service.get_character(name)
    if not char:
        return jsonify({'error': 'Character not found'}), 404
    return jsonify({
        'character_name': char.character_name,
        'player_discord': char.player_discord or '',
        'player_discord_name': char.player_discord_name or '',
        'clan': char.clan or '',
        'age_category': char.age_category or '',
        'sect': char.sect or '',
        'active': char.active,
    }), 200


@bp.route('/roster/character/<name>', methods=['PATCH'])
@require_bot_scope('write')
@_limit('60 per hour')
def update_character_api(name):
    """Update clan, age_category, sect, and/or ticket_channel_id for an existing character."""
    from app.models import CLANS, AGE_CATEGORIES, SECTS

    char = db_service.get_character(name)
    if not char:
        return jsonify({'error': 'Character not found'}), 404

    data = request.get_json(silent=True) or {}
    updates = {}
    for field in ('clan', 'age_category', 'sect'):
        if field in data:
            updates[field] = (data[field] or '').strip()
    if 'ticket_channel_id' in data:
        updates['ticket_channel_id'] = (data['ticket_channel_id'] or '').strip() or None

    if not updates:
        return jsonify({'error': 'No updatable fields provided'}), 400

    if 'clan' in updates and updates['clan'] and updates['clan'] not in CLANS:
        return jsonify({'error': f'Invalid clan: {updates["clan"]}'}), 400
    if 'age_category' in updates and updates['age_category'] and updates['age_category'] not in AGE_CATEGORIES:
        return jsonify({'error': f'Invalid age_category: {updates["age_category"]}'}), 400
    if 'sect' in updates and updates['sect'] and updates['sect'] not in SECTS:
        return jsonify({'error': f'Invalid sect: {updates["sect"]}'}), 400

    db_service.update_character(name, updates)
    requester_name = (data.get('requesterDiscordName') or 'bot').strip()
    db_service.log_action(
        staff_user=requester_name,
        action_type='edit_character',
        target=name,
        details=f'Updated via bot: {", ".join(updates.keys())}',
    )
    return jsonify({'ok': True, 'character_name': name}), 200


@bp.route('/roster/character/<name>/rename', methods=['POST'])
@require_bot_scope('write')
@_limit('30 per hour')
def rename_character_api(name):
    """Rename a character and migrate all related records."""
    char = db_service.get_character(name)
    if not char:
        return jsonify({'error': 'Character not found'}), 404

    data = request.get_json(silent=True) or {}
    new_name = (data.get('new_name') or '').strip()
    if not new_name:
        return jsonify({'error': 'new_name is required'}), 400
    if new_name.lower() == name.lower():
        return jsonify({'error': 'New name is the same as the current name'}), 400

    try:
        db_service.rename_character(name, new_name)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 409

    requester_name = (data.get('requesterDiscordName') or 'bot').strip()
    db_service.log_action(
        staff_user=requester_name,
        action_type='rename_character',
        target=new_name,
        details=f'Renamed via bot: "{name}" → "{new_name}"',
    )
    return jsonify({'ok': True, 'old_name': name, 'new_name': new_name}), 200


@bp.route('/roster/character', methods=['POST'])
@require_bot_scope('write')
@_limit('60 per hour')
def create_character():
    """Create a new character roster entry via the bot (e.g. /lasombra approve).

    Body fields:
      character_name       string, required
      player_discord       string (Discord snowflake), optional
      player_discord_name  string (Discord username), optional
      clan                 string, must match CLANS list
      age_category         string, must match AGE_CATEGORIES list
      sect                 string, must match SECTS list
      requesterDiscordId   string, for audit log
      requesterDiscordName string, for audit log
    """
    from app.models import Character, CLANS, AGE_CATEGORIES, SECTS

    data = request.get_json(silent=True) or {}
    character_name = (data.get('character_name') or '').strip()
    if not character_name:
        return jsonify({'error': 'character_name is required'}), 400

    clan = (data.get('clan') or '').strip()
    age_category = (data.get('age_category') or '').strip()
    sect = (data.get('sect') or '').strip()
    player_discord = (data.get('player_discord') or '').strip()
    player_discord_name = (data.get('player_discord_name') or '').strip()
    requester_name = (data.get('requesterDiscordName') or 'bot').strip()

    if clan and clan not in CLANS:
        return jsonify({'error': f'Invalid clan: {clan}'}), 400
    if age_category and age_category not in AGE_CATEGORIES:
        return jsonify({'error': f'Invalid age_category: {age_category}'}), 400
    if sect and sect not in SECTS:
        return jsonify({'error': f'Invalid sect: {sect}'}), 400

    existing = db_service.get_character(character_name)
    if existing:
        return jsonify({'error': f'Character "{character_name}" already exists'}), 409

    char = Character(
        character_name=character_name,
        player_discord=player_discord,
        player_discord_name=player_discord_name,
        clan=clan,
        age_category=age_category,
        sect=sect,
        active=True,
        creation_xp=0,
    )
    db_service.add_character(char)
    if sheets_sync:
        sheets_sync.sync_add_character(char)

    db_service.log_action(
        staff_user=requester_name,
        action_type='add_character',
        target=character_name,
        details=f'Added character via bot: {character_name} ({clan}, {sect})',
    )

    return jsonify({'ok': True, 'character_name': character_name}), 201


@bp.route('/roster/character/<name>', methods=['DELETE'])
@require_bot_scope('write')
@_limit('60 per hour')
def delete_character(name):
    """Hard-delete a character roster entry.

    Refused with 409 if the character has any XP claims, spend requests, or
    ledger entries — those characters should be retired/deceased instead.
    """
    from app.db import db, DbCharacter, DbXPClaim, DbSpendRequest, DbLedgerEntry
    from sqlalchemy import func as _func

    row = DbCharacter.query.filter(
        _func.lower(DbCharacter.character_name) == name.lower()
    ).first()
    if not row:
        return jsonify({'error': 'Character not found'}), 404

    char_name = row.character_name

    has_history = (
        DbXPClaim.query.filter(_func.lower(DbXPClaim.character_name) == char_name.lower()).first() or
        DbSpendRequest.query.filter(_func.lower(DbSpendRequest.character_name) == char_name.lower()).first() or
        DbLedgerEntry.query.filter(_func.lower(DbLedgerEntry.character_name) == char_name.lower()).first()
    )
    if has_history:
        return jsonify({
            'error': 'Character has existing history (claims, spends, or ledger entries). '
                     'Use retired or deceased status instead of deleting.',
        }), 409

    data = request.get_json(silent=True) or {}
    requester_name = (data.get('requesterDiscordName') or 'bot').strip()

    db.session.delete(row)
    db.session.commit()

    db_service.log_action(
        staff_user=requester_name,
        action_type='delete_character',
        target=char_name,
        details=f'Hard-deleted character via bot (no history): {char_name}',
    )

    return jsonify({'ok': True, 'character_name': char_name}), 200


@bp.route('/cc/submitted-drafts', methods=['GET'])
@require_bot_scope('read')
@_limit('30 per minute')
def cc_submitted_drafts():
    """Return recently-submitted character creation drafts since sinceEpoch.

    Used by the bot's CharacterSubmissionNotifier to post ticket-channel
    summaries when a player submits a character for ST review.
    """
    import json as _json
    from app.db import CharacterDraft

    try:
        since_epoch = int(request.args.get('sinceEpoch', '0'))
    except (TypeError, ValueError):
        return jsonify({'error': 'sinceEpoch must be an integer'}), 400
    if since_epoch < 0:
        return jsonify({'error': 'sinceEpoch must be non-negative'}), 400
    try:
        limit = int(request.args.get('limit', '50'))
    except (TypeError, ValueError):
        return jsonify({'error': 'limit must be an integer'}), 400
    if limit < 1 or limit > 200:
        return jsonify({'error': 'limit must be between 1 and 200'}), 400

    since_dt = datetime.fromtimestamp(since_epoch, tz=timezone.utc)
    rows = (
        CharacterDraft.query
        .filter(
            CharacterDraft.status == 'submitted',
            CharacterDraft.submitted_at > since_dt,
        )
        .order_by(CharacterDraft.submitted_at.asc())
        .limit(limit + 1)
        .all()
    )
    has_more = len(rows) > limit
    rows = rows[:limit]

    def _cd_field(draft, key):
        try:
            data = _json.loads(draft.character_data) if draft.character_data else {}
            return data.get(key)
        except Exception:
            return None

    events = [
        {
            'id': d.id,
            'character_name': d.character_name or '',
            'player_discord_id': d.player_discord_id,
            'ticket_channel_id': d.ticket_channel_id,
            'submitted_at_epoch': int(d.submitted_at.timestamp()),
            'age_category': _cd_field(d, 'age_category') or '',
            'clan': _cd_field(d, 'clan') or '',
            'submission_notes': _cd_field(d, 'submission_notes') or '',
        }
        for d in rows
    ]
    return jsonify({'events': events, 'has_more': has_more})


@bp.route('/cc/pending-sheet-imports', methods=['GET'])
@require_bot_scope('read')
@_limit('30 per minute')
def cc_pending_sheet_imports():
    """Return recently-submitted RoD sheet imports awaiting staff review since sinceEpoch.

    Used by the bot's SheetImportNotifier (Issue #292) to post to the character's
    cubby channel with a staff ping when a player (re-)imports a sheet.
    """
    from app.db import CharacterDraft, DbCharacter

    try:
        since_epoch = int(request.args.get('sinceEpoch', '0'))
    except (TypeError, ValueError):
        return jsonify({'error': 'sinceEpoch must be an integer'}), 400
    if since_epoch < 0:
        return jsonify({'error': 'sinceEpoch must be non-negative'}), 400
    try:
        limit = int(request.args.get('limit', '50'))
    except (TypeError, ValueError):
        return jsonify({'error': 'limit must be an integer'}), 400
    if limit < 1 or limit > 200:
        return jsonify({'error': 'limit must be between 1 and 200'}), 400

    since_dt = datetime.fromtimestamp(since_epoch, tz=timezone.utc)
    rows = (
        CharacterDraft.query
        .filter(
            CharacterDraft.status == 'sheet_review',
            CharacterDraft.submitted_at > since_dt,
        )
        .order_by(CharacterDraft.submitted_at.asc())
        .limit(limit + 1)
        .all()
    )
    has_more = len(rows) > limit
    rows = rows[:limit]

    # Bulk-fetch cubby channel IDs from the roster for all drafts that have one.
    roster_ids = [d.roster_character_id for d in rows if d.roster_character_id is not None]
    cubby_by_roster_id: dict = {}
    if roster_ids:
        chars = DbCharacter.query.filter(DbCharacter.id.in_(roster_ids)).all()
        cubby_by_roster_id = {c.id: c.ticket_channel_id for c in chars}

    events = [
        {
            'id': d.id,
            'character_name': d.character_name or '',
            'player_discord_id': d.player_discord_id,
            'submitted_at_epoch': int(d.submitted_at.timestamp()),
            'cubby_channel_id': cubby_by_roster_id.get(d.roster_character_id) if d.roster_character_id else None,
        }
        for d in rows
    ]
    return jsonify({'events': events, 'has_more': has_more})


@bp.route('/cc/approved-drafts', methods=['GET'])
@require_bot_scope('read')
@_limit('30 per minute')
def cc_approved_drafts():
    """Return recently-approved CC drafts since sinceEpoch.

    Used by the bot's CharacterApprovalNotifier to post to #player-character-sheets.
    Only returns non-SPC drafts.
    """
    import json as _json
    from app.db import CharacterDraft

    try:
        since_epoch = int(request.args.get('sinceEpoch', '0'))
    except (TypeError, ValueError):
        return jsonify({'error': 'sinceEpoch must be an integer'}), 400
    try:
        limit = int(request.args.get('limit', '50'))
    except (TypeError, ValueError):
        return jsonify({'error': 'limit must be an integer'}), 400
    if limit < 1 or limit > 200:
        return jsonify({'error': 'limit must be between 1 and 200'}), 400

    since_dt = datetime.fromtimestamp(since_epoch, tz=timezone.utc)
    rows = (
        CharacterDraft.query
        .filter(
            CharacterDraft.status == 'approved',
            CharacterDraft.approved_at > since_dt,
            CharacterDraft.is_spc == False,  # noqa: E712
        )
        .order_by(CharacterDraft.approved_at.asc())
        .limit(limit + 1)
        .all()
    )
    has_more = len(rows) > limit
    rows = rows[:limit]

    def _cd(draft, key):
        try:
            data = _json.loads(draft.character_data) if draft.character_data else {}
            return data.get(key)
        except Exception:
            return None

    def _predator_name(draft):
        pt = _cd(draft, 'predatorType')
        if isinstance(pt, dict):
            return pt.get('name', '')
        return pt or ''

    events = [
        {
            'id': d.id,
            'character_name': d.character_name or '',
            'player_discord_id': d.player_discord_id,
            'approved_at_epoch': int(d.approved_at.timestamp()),
            'approved_by': d.approved_by or '',
            'clan': _cd(d, 'clan') or '',
            'age_category': _cd(d, 'age_category') or '',
            'predator_type': _predator_name(d),
        }
        for d in rows
    ]
    return jsonify({'events': events, 'has_more': has_more})


@bp.route('/discord-activity/record', methods=['POST'])
@require_bot_scope('write')
@_limit('120 per minute')
def discord_activity_record():
    """Accept batched Discord post counts from the bot.

    Body: { "entries": [{ "discord_id": "...", "date": "YYYY-MM-DD",
                          "category": "ic|ooc|rolls|cubby", "count": N }],
            "mode": "increment" | "replace" }

    mode="increment" (default): existing counts are incremented — for the
    live tracker, which only ever reports a small delta of new messages
    seen since its last flush.

    mode="replace": existing counts are overwritten with the given value —
    for the historical backfill scanner, which recomputes the true total
    for whatever (discord_id, date, category) triples it scans each run.
    Re-running a backfill over the same window must be idempotent; treating
    a fresh full recount as an *increment* on top of a prior run's numbers
    is what silently inflated historical counts by orders of magnitude
    (one day hit 2.3M "posts") before this was caught and the corrupted
    rows purged. See docs/RELEASE notes / audit_log for the incident.
    """
    from app.db import db
    from sqlalchemy import text
    body = request.get_json(silent=True) or {}
    entries = body.get('entries', [])
    if not isinstance(entries, list):
        return jsonify({'error': 'entries must be a list'}), 400
    if len(entries) > 2000:
        return jsonify({'error': 'too many entries'}), 400

    mode = str(body.get('mode', 'increment')).strip().lower()
    if mode not in ('increment', 'replace'):
        mode = 'increment'

    _valid_categories = {'ic', 'ooc', 'rolls', 'cubby'}
    # Generous per-entry ceiling — no legitimate human posts anywhere near
    # this many times in one channel category in one day. Catches the next
    # scanning/flush bug before it can silently inflate the table again,
    # rather than only ever finding out by eyeballing totals after the fact.
    _max_reasonable_count = 1000

    # Validate and collect entries
    valid: list[dict] = []
    rejected_implausible = 0
    for entry in entries:
        discord_id = str(entry.get('discord_id', '')).strip()
        date = str(entry.get('date', '')).strip()
        category = str(entry.get('category', '')).strip()
        try:
            count = int(entry.get('count', 0))
        except (TypeError, ValueError):
            continue
        if not discord_id or not date or category not in _valid_categories or count <= 0:
            continue
        if count > _max_reasonable_count:
            rejected_implausible += 1
            current_app.logger.warning(
                'discord_activity_record: rejected implausible count %s for discord_id=%s date=%s category=%s (mode=%s)',
                count, discord_id, date, category, mode,
            )
            continue
        valid.append({'did': discord_id, 'dt': date, 'cat': category, 'cnt': count})

    # Bulk upsert all entries in one statement to avoid N round-trips to Turso.
    # libsql supports up to 32766 bound variables; 4 per row × 500 rows = 2000, well within limit.
    if valid:
        placeholders = ', '.join(f'(:did_{i}, :dt_{i}, :cat_{i}, :cnt_{i})' for i in range(len(valid)))
        params = {}
        for i, row in enumerate(valid):
            params[f'did_{i}'] = row['did']
            params[f'dt_{i}'] = row['dt']
            params[f'cat_{i}'] = row['cat']
            params[f'cnt_{i}'] = row['cnt']
        conflict_update = (
            'count = excluded.count'
            if mode == 'replace'
            else 'count = discord_post_counts.count + excluded.count'
        )
        db.session.execute(
            text(
                f"INSERT INTO discord_post_counts (discord_id, date, category, count)"
                f" VALUES {placeholders}"
                f" ON CONFLICT(discord_id, date, category)"
                f" DO UPDATE SET {conflict_update}"
            ),
            params,
        )

    # Optional names dict: { discord_id: display_name } — bulk upsert
    from datetime import datetime, timezone
    names = body.get('names', {})
    if isinstance(names, dict):
        ts = datetime.now(timezone.utc).isoformat()
        valid_names = [
            (str(did).strip(), str(name).strip()[:200])
            for did, name in names.items()
            if str(did).strip() and str(name).strip()
        ]
        if valid_names:
            name_placeholders = ', '.join(f'(:did_{i}, :name_{i}, :ts)' for i in range(len(valid_names)))
            name_params: dict = {'ts': ts}
            for i, (did, name) in enumerate(valid_names):
                name_params[f'did_{i}'] = did
                name_params[f'name_{i}'] = name
            db.session.execute(
                text(
                    f"INSERT INTO discord_display_names (discord_id, display_name, updated_at)"
                    f" VALUES {name_placeholders}"
                    f" ON CONFLICT(discord_id)"
                    f" DO UPDATE SET display_name=excluded.display_name, updated_at=excluded.updated_at"
                ),
                name_params,
            )

    db.session.commit()
    return jsonify({'ok': True, 'flushed': len(valid), 'rejected': rejected_implausible})


@bp.route('/discord-member-events/record', methods=['POST'])
@require_bot_scope('write')
@_limit('60 per minute')
def discord_member_events_record():
    """Accept batched member-growth events from the bot: server joins and
    first-time Kindred/Ghoul/Mortal role gains.

    Body: { "events": [{ "discord_id": "...", "event_type": "join"|"role_gain",
                         "role": ""|"kindred"|"ghoul"|"mortal", "date": "YYYY-MM-DD" }],
            "names": { "discord_id": "display_name", ... } }

    These are discrete events, not running counts — deliberately, so a
    duplicate report (e.g. a full member sweep re-run on every bot restart)
    is a plain idempotent no-op via ON CONFLICT DO NOTHING, rather than
    needing increment/replace mode semantics at all. See discord_activity_record
    above for the corruption incident this design avoids repeating.
    """
    from app.db import db
    from sqlalchemy import text
    body = request.get_json(silent=True) or {}
    events = body.get('events', [])
    if not isinstance(events, list):
        return jsonify({'error': 'events must be a list'}), 400
    if len(events) > 500:
        return jsonify({'error': 'too many events'}), 400

    _valid_event_types = {'join', 'role_gain'}
    _valid_roles = {'', 'kindred', 'ghoul', 'mortal'}

    valid: list[dict] = []
    for event in events:
        discord_id = str(event.get('discord_id', '')).strip()
        event_type = str(event.get('event_type', '')).strip()
        role = str(event.get('role', '')).strip().lower()
        date = str(event.get('date', '')).strip()
        if not discord_id or event_type not in _valid_event_types or role not in _valid_roles or not date:
            continue
        if event_type == 'role_gain' and not role:
            continue  # role_gain must name which role was gained
        if event_type == 'join' and role:
            continue  # join events don't carry a role
        valid.append({'did': discord_id, 'etype': event_type, 'role': role, 'dt': date})

    if valid:
        placeholders = ', '.join(f'(:did_{i}, :etype_{i}, :role_{i}, :dt_{i})' for i in range(len(valid)))
        params = {}
        for i, row in enumerate(valid):
            params[f'did_{i}'] = row['did']
            params[f'etype_{i}'] = row['etype']
            params[f'role_{i}'] = row['role']
            params[f'dt_{i}'] = row['dt']
        db.session.execute(
            text(
                f"INSERT INTO discord_member_events (discord_id, event_type, role, date)"
                f" VALUES {placeholders}"
                f" ON CONFLICT(discord_id, event_type, role, date) DO NOTHING"
            ),
            params,
        )

    # Optional names dict — same shape/upsert as discord_activity_record
    from datetime import datetime, timezone
    names = body.get('names', {})
    if isinstance(names, dict):
        ts = datetime.now(timezone.utc).isoformat()
        valid_names = [
            (str(did).strip(), str(name).strip()[:200])
            for did, name in names.items()
            if str(did).strip() and str(name).strip()
        ]
        if valid_names:
            name_placeholders = ', '.join(f'(:did_{i}, :name_{i}, :ts)' for i in range(len(valid_names)))
            name_params: dict = {'ts': ts}
            for i, (did, name) in enumerate(valid_names):
                name_params[f'did_{i}'] = did
                name_params[f'name_{i}'] = name
            db.session.execute(
                text(
                    f"INSERT INTO discord_display_names (discord_id, display_name, updated_at)"
                    f" VALUES {name_placeholders}"
                    f" ON CONFLICT(discord_id)"
                    f" DO UPDATE SET display_name=excluded.display_name, updated_at=excluded.updated_at"
                ),
                name_params,
            )

    db.session.commit()
    return jsonify({'ok': True, 'inserted': len(valid)})


@bp.route('/periods/recent', methods=['GET'])
@require_bot_scope('read')
@_limit('60 per minute')
def periods_recent():
    """Return the most recent N play periods with their date ranges.

    Query param: count (default 2, max 50).
    Response: { periods: [{ label, nightNumber, startDate, endDate }] }
    """
    from app.db import DbPlayPeriod
    try:
        count = min(50, max(1, int(request.args.get('count', 2))))
    except (ValueError, TypeError):
        count = 2
    rows = (
        DbPlayPeriod.query
        .order_by(DbPlayPeriod.night_number.desc())
        .limit(count)
        .all()
    )
    def _iso(d: str) -> str:
        d = (d or '').strip()
        if len(d) == 8 and d.isdigit():
            return f'{d[:4]}-{d[4:6]}-{d[6:]}'
        return d

    return jsonify({
        'periods': [
            {
                'label': p.period_label,
                'nightNumber': p.night_number,
                'startDate': _iso(p.start_date),
                'endDate': _iso(p.end_date),
            }
            for p in rows
        ]
    })


@bp.route('/sheets/reconcile', methods=['POST'])
@require_bot_scope('write')
@_limit('5 per hour')
def sheets_reconcile():
    """Trigger a full Sheets reconciliation diff/repair.

    Compares DB state to Google Sheets across all four data types (claims,
    spends, ledger, characters) and appends/updates any gaps. Returns a
    summary of what was changed. Intended to be called by the bot once
    nightly.
    """
    if sheets_sync is None:
        return jsonify({'error': 'Sheets sync not configured'}), 503
    try:
        summary = sheets_sync.reconcile(db_service)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500
    return jsonify(summary)


@bp.route('/staff/sync', methods=['POST'])
@require_bot_scope('write')
def staff_sync():
    """Sync staff role membership from Discord.

    Accepts a list of upsert/remove operations and optionally performs a full
    replacement (removes any DB staff entries not present in the upsert list).

    Body:
      {
        "operations": [
          {"action": "upsert", "discord_id": "...", "display_name": "...", "role": "storyteller"},
          {"action": "remove", "discord_id": "..."}
        ],
        "full_sync": true   // optional: remove DB entries not in this payload
      }
    """
    from app.db import AppSetting, db
    body = request.get_json(silent=True) or {}
    operations = body.get('operations', [])
    full_sync = bool(body.get('full_sync', False))

    if not isinstance(operations, list):
        return jsonify({'error': 'operations must be an array'}), 400

    valid_roles = {'system_helper', 'storyteller', 'moderator', 'administrator'}
    valid_actions = {'upsert', 'remove'}

    upserted_ids: set[str] = set()

    for op in operations:
        action = op.get('action')
        discord_id = str(op.get('discord_id', '')).strip()
        if not discord_id or action not in valid_actions:
            return jsonify({'error': f'Invalid operation: {op}'}), 400

        if action == 'upsert':
            role = op.get('role')
            if role not in valid_roles:
                return jsonify({'error': f'Invalid role: {role}'}), 400
            display_name = str(op.get('display_name', '')).strip()
            member_key = f'STAFF_MEMBER_{discord_id}'
            name_key = f'STAFF_NAME_{discord_id}'
            row = AppSetting.query.get(member_key)
            if row:
                row.value = role
            else:
                db.session.add(AppSetting(key=member_key, value=role))
            name_row = AppSetting.query.get(name_key)
            if name_row:
                name_row.value = display_name
            else:
                db.session.add(AppSetting(key=name_key, value=display_name))
            upserted_ids.add(discord_id)
        else:  # remove
            member_key = f'STAFF_MEMBER_{discord_id}'
            name_key = f'STAFF_NAME_{discord_id}'
            row = AppSetting.query.get(member_key)
            if row:
                db.session.delete(row)
            name_row = AppSetting.query.get(name_key)
            if name_row:
                db.session.delete(name_row)

    if full_sync:
        # Remove any DB staff entries not present in this payload's upsert list
        existing = AppSetting.query.filter(
            AppSetting.key.like('STAFF_MEMBER_%')
        ).all()
        for row in existing:
            existing_id = row.key[len('STAFF_MEMBER_'):]
            if existing_id not in upserted_ids:
                db.session.delete(row)
                name_row = AppSetting.query.get(f'STAFF_NAME_{existing_id}')
                if name_row:
                    db.session.delete(name_row)

    db.session.commit()
    return jsonify({'ok': True, 'processed': len(operations)})


# ---------------------------------------------------------------------------
# Coterie API — for bot and wiki sync
# ---------------------------------------------------------------------------

@bp.route('/coteries', methods=['GET'])
@require_bot_scope('read')
def list_coteries():
    """Return all active coteries with members. Used by wiki sync and bot."""
    from app.db import Coterie
    coteries = Coterie.query.filter_by(status='active').order_by(Coterie.name).all()
    result = []
    for c in coteries:
        members = []
        for m in c.members:
            char = m.character
            members.append({
                'character_name': char.character_name,
                'clan': char.clan or '',
                'player_discord_id': char.player_discord or '',
            })
        result.append({
            'id': c.id,
            'name': c.name,
            'slug': c.slug,
            'description': c.description or '',
            'discord_channel_id': c.discord_channel_id,
            'members': members,
        })
    return jsonify({'coteries': result})


@bp.route('/coteries/activate', methods=['POST'])
@require_bot_scope('write')
def activate_coterie():
    """Bot: find a pending coterie by name, set its Discord channel, return data.

    Body: { name: str, discord_channel_id: str }
    """
    from app.db import Coterie, db
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    channel_id = (data.get('discord_channel_id') or '').strip()

    if not name:
        return jsonify({'error': 'name is required'}), 400

    coterie = Coterie.query.filter(
        Coterie.name.ilike(name)
    ).first()
    if not coterie:
        return jsonify({'error': f'No coterie found with name "{name}"'}), 404
    if coterie.status == 'active':
        return jsonify({'error': f'"{name}" is already active'}), 409

    from datetime import datetime, timezone
    coterie.status = 'active'
    if channel_id:
        coterie.discord_channel_id = channel_id
    coterie.updated_at = datetime.now(timezone.utc)
    db.session.commit()

    members = [
        {
            'character_name': m.character.character_name,
            'player_discord_id': m.character.player_discord or '',
            'free_dots': m.free_dots_remaining,
        }
        for m in coterie.members
    ]
    return jsonify({
        'ok': True,
        'coterie': {
            'id': coterie.id,
            'name': coterie.name,
            'slug': coterie.slug,
            'members': members,
            'free_pool_total': sum(m.free_dots_remaining for m in coterie.members),
        },
    })


@bp.route('/coteries/by-character/<discord_id>', methods=['GET'])
@require_bot_scope('read')
def get_coterie_for_character(discord_id: str):
    """Return the coterie for the given player's active character.

    Used by the bot's /coterie status command.
    Response: { coterie, character_name, members } or 404.
    """
    from app.db import CoterieMember, DbCharacter
    from sqlalchemy import func as _func

    character_name = request.args.get('character_name', '').strip()
    q = DbCharacter.query.filter_by(player_discord=discord_id, active=True)
    if character_name:
        q = q.filter(_func.lower(DbCharacter.character_name) == character_name.lower())
    char = q.first()
    if not char:
        return jsonify({'error': 'No active character found for this Discord user'}), 404

    membership = CoterieMember.query.filter_by(
        roster_character_id=char.id
    ).first()
    if not membership:
        return jsonify({'coterie': None, 'character_name': char.character_name}), 200

    coterie = membership.coterie
    members = []
    for m in coterie.members:
        c = m.character
        members.append({
            'character_name': c.character_name,
            'clan': c.clan or '',
            'player_discord_id': c.player_discord or '',
            'player_name': c.player_discord_name or '',
        })

    return jsonify({
        'character_name': char.character_name,
        'coterie': {
            'id': coterie.id,
            'name': coterie.name,
            'slug': coterie.slug,
            'description': coterie.description or '',
            'status': coterie.status,
            'chasse': coterie.chasse,
            'lien': coterie.lien,
            'portillon': coterie.portillon,
        },
        'members': members,
    })


# --- Boon API ---

_BOON_TIERS = {'trivial', 'minor', 'major', 'life'}


def _boon_to_dict(boon, creditor, debtor) -> dict:
    return {
        'id': boon.id,
        'creditor_character_name': creditor.character_name,
        'debtor_character_name': debtor.character_name,
        'tier': boon.tier,
        'reason': boon.reason or '',
        'status': boon.status,
        'created_at': boon.created_at.isoformat() if boon.created_at else None,
        'resolved_at': boon.resolved_at.isoformat() if boon.resolved_at else None,
    }


@bp.route('/boons', methods=['POST'])
@require_bot_scope('write')
@require_replay_protection
@_limit("20 per minute")
def create_boon():
    """Create a boon: the creditor's player asserts the debtor owes them one.

    Body: { creditorCharacterName, debtorCharacterName, tier, reason, requesterDiscordId, requesterDiscordName }
    """
    backend = _require_db()
    if backend:
        return backend

    payload = request.get_json(silent=True) or {}
    _, _, effective_discord_id, _, _, error = _requester_from_payload(payload)
    if error:
        return error

    from app.db import DbBoon, DbCharacter, db
    from sqlalchemy import func as _func

    creditor_name = str(payload.get('creditorCharacterName', '')).strip()
    debtor_name = str(payload.get('debtorCharacterName', '')).strip()
    tier = str(payload.get('tier', '')).strip().lower()
    reason = str(payload.get('reason', '')).strip()

    if not creditor_name or not debtor_name:
        return jsonify({'error': 'creditorCharacterName and debtorCharacterName are required'}), 400
    if tier not in _BOON_TIERS:
        return jsonify({'error': f'tier must be one of {", ".join(sorted(_BOON_TIERS))}'}), 400

    creditor = DbCharacter.query.filter(_func.lower(DbCharacter.character_name) == creditor_name.lower()).first()
    if not creditor or not creditor.active:
        return jsonify({'error': f'No active character found named "{creditor_name}"'}), 404
    debtor = DbCharacter.query.filter(_func.lower(DbCharacter.character_name) == debtor_name.lower()).first()
    if not debtor or not debtor.active:
        return jsonify({'error': f'No active character found named "{debtor_name}"'}), 404
    if creditor.id == debtor.id:
        return jsonify({'error': 'A character cannot owe a boon to themself'}), 400

    if not _requester_can_access_character(creditor, effective_discord_id):
        return _forbidden('You can only create a boon owed to your own character')

    boon = DbBoon(
        creditor_character_id=creditor.id,
        debtor_character_id=debtor.id,
        tier=tier,
        reason=reason,
        created_by_discord_id=effective_discord_id,
    )
    db.session.add(boon)
    db.session.commit()

    return jsonify({'ok': True, 'boon': _boon_to_dict(boon, creditor, debtor)}), 201


@bp.route('/boons/by-character/<discord_id>', methods=['GET'])
@require_bot_scope('read')
def list_boons_for_character(discord_id: str):
    """List boons where one of the requester's characters is creditor or debtor."""
    from app.db import DbBoon, DbCharacter
    from sqlalchemy import func as _func, or_ as _or

    character_name = request.args.get('character_name', '').strip()
    status_filter = request.args.get('status', '').strip().lower()

    q = DbCharacter.query.filter_by(player_discord=discord_id, active=True)
    if character_name:
        q = q.filter(_func.lower(DbCharacter.character_name) == character_name.lower())
    char = q.first()
    if not char:
        return jsonify({'error': 'No active character found for this Discord user'}), 404

    boon_q = DbBoon.query.filter(
        _or(DbBoon.creditor_character_id == char.id, DbBoon.debtor_character_id == char.id)
    )
    if status_filter:
        boon_q = boon_q.filter(DbBoon.status == status_filter)
    boons = boon_q.order_by(DbBoon.created_at.desc()).all()

    result = []
    for b in boons:
        direction = 'owed_to_me' if b.creditor_character_id == char.id else 'i_owe'
        counterparty = b.debtor if direction == 'owed_to_me' else b.creditor
        result.append({
            'id': b.id,
            'direction': direction,
            'counterparty_name': counterparty.character_name,
            'tier': b.tier,
            'reason': b.reason or '',
            'status': b.status,
            'created_at': b.created_at.isoformat() if b.created_at else None,
        })

    return jsonify({'character_name': char.character_name, 'boons': result})


@bp.route('/boons/<int:boon_id>/repay-action', methods=['POST'])
@require_bot_scope('write')
@require_replay_protection
@_limit("20 per minute")
def boon_repay_action(boon_id: int):
    """Two-step repayment: debtor proposes, creditor confirms.

    Body: { requesterDiscordId, requesterDiscordName }
    """
    backend = _require_db()
    if backend:
        return backend

    payload = request.get_json(silent=True) or {}
    _, _, effective_discord_id, _, _, error = _requester_from_payload(payload)
    if error:
        return error

    from app.db import DbBoon, db

    boon = DbBoon.query.get(boon_id)
    if not boon:
        return jsonify({'error': 'Boon not found'}), 404

    is_creditor = _requester_can_access_character(boon.creditor, effective_discord_id, allow_staff_bypass=False)
    is_debtor = _requester_can_access_character(boon.debtor, effective_discord_id, allow_staff_bypass=False)
    is_staff = _is_requester_staff(effective_discord_id)

    if boon.status == 'owed':
        if not (is_debtor or is_staff):
            return jsonify({'error': 'Only the debtor can propose repayment of an owed boon'}), 409
        boon.status = 'repayment_offered'
        db.session.commit()
        return jsonify({'ok': True, 'boon': _boon_to_dict(boon, boon.creditor, boon.debtor)})

    if boon.status == 'repayment_offered':
        if not (is_creditor or is_staff):
            return jsonify({'error': 'Only the creditor can confirm a proposed repayment'}), 409
        boon.status = 'repaid'
        boon.resolved_at = datetime.now(timezone.utc)
        db.session.commit()
        return jsonify({'ok': True, 'boon': _boon_to_dict(boon, boon.creditor, boon.debtor)})

    return jsonify({'error': f'Boon is already {boon.status} — nothing to do'}), 409


# --- Contact Thread API ---

def _contact_thread_summary(thread) -> dict:
    return {
        'id': thread.id,
        'participant_names': [p.character.character_name for p in thread.participants],
        'last_message_at': thread.last_message_at.isoformat() if thread.last_message_at else None,
        'message_count': len(thread.messages),
    }


@bp.route('/contact-threads', methods=['POST'])
@require_bot_scope('write')
@require_replay_protection
@_limit("20 per minute")
def create_contact_thread():
    """Start a new #kindred-contact conversation, possibly with multiple recipients.

    Body: { senderCharacterName, recipientCharacterNames: [...], body, requesterDiscordId, requesterDiscordName }
    """
    backend = _require_db()
    if backend:
        return backend

    payload = request.get_json(silent=True) or {}
    _, _, effective_discord_id, _, _, error = _requester_from_payload(payload)
    if error:
        return error

    from app.db import DbCharacter, DbContactMessage, DbContactParticipant, DbContactThread, db
    from sqlalchemy import func as _func

    sender_name = str(payload.get('senderCharacterName', '')).strip()
    recipient_names = payload.get('recipientCharacterNames') or []
    body = str(payload.get('body', '')).strip()

    if not sender_name:
        return jsonify({'error': 'senderCharacterName is required'}), 400
    if not isinstance(recipient_names, list) or not recipient_names:
        return jsonify({'error': 'recipientCharacterNames must be a non-empty list'}), 400
    if not body:
        return jsonify({'error': 'body is required'}), 400

    sender = DbCharacter.query.filter(_func.lower(DbCharacter.character_name) == sender_name.lower()).first()
    if not sender or not sender.active:
        return jsonify({'error': f'No active character found named "{sender_name}"'}), 404
    if not _requester_can_access_character(sender, effective_discord_id):
        return _forbidden('You can only send from your own character')

    recipients = []
    unresolved = []
    for raw_name in recipient_names:
        name = str(raw_name or '').strip()
        if not name:
            continue
        char = DbCharacter.query.filter(_func.lower(DbCharacter.character_name) == name.lower()).first()
        if not char or not char.active:
            unresolved.append(name)
        elif char.id != sender.id:
            recipients.append(char)
    if unresolved:
        return jsonify({'error': f'Could not find active character(s): {", ".join(unresolved)}'}), 404
    if not recipients:
        return jsonify({'error': 'At least one valid recipient other than the sender is required'}), 400

    thread = DbContactThread()
    db.session.add(thread)
    db.session.flush()  # assigns thread.id, needed for participant rows below

    all_participants = [sender] + recipients
    for char in all_participants:
        db.session.add(DbContactParticipant(thread_id=thread.id, character_id=char.id))
    db.session.add(DbContactMessage(thread_id=thread.id, sender_character_id=sender.id, body=body))
    db.session.commit()

    return jsonify({
        'ok': True,
        'thread_id': thread.id,
        'participants': [
            {'character_name': c.character_name, 'discord_id': c.player_discord or ''}
            for c in all_participants
        ],
    }), 201


@bp.route('/contact-threads/by-character/<discord_id>', methods=['GET'])
@require_bot_scope('read')
def list_contact_threads_for_character(discord_id: str):
    """List open conversations one of the requester's characters participates in."""
    from app.db import DbCharacter, DbContactParticipant, DbContactThread
    from sqlalchemy import func as _func

    character_name = request.args.get('character_name', '').strip()
    q = DbCharacter.query.filter_by(player_discord=discord_id, active=True)
    if character_name:
        q = q.filter(_func.lower(DbCharacter.character_name) == character_name.lower())
    char = q.first()
    if not char:
        return jsonify({'error': 'No active character found for this Discord user'}), 404

    thread_ids = [
        p.thread_id for p in DbContactParticipant.query.filter_by(character_id=char.id).all()
    ]
    threads = []
    if thread_ids:
        threads = (
            DbContactThread.query.filter(DbContactThread.id.in_(thread_ids))
            .order_by(DbContactThread.last_message_at.desc())
            .limit(25)
            .all()
        )

    return jsonify({
        'character_name': char.character_name,
        'threads': [_contact_thread_summary(t) for t in threads],
    })


@bp.route('/contact-threads/<int:thread_id>/messages', methods=['POST'])
@require_bot_scope('write')
@require_replay_protection
@_limit("20 per minute")
def reply_to_contact_thread(thread_id: int):
    """Reply to an existing #kindred-contact conversation.

    Body: { senderCharacterName, body, requesterDiscordId, requesterDiscordName }
    """
    backend = _require_db()
    if backend:
        return backend

    payload = request.get_json(silent=True) or {}
    _, _, effective_discord_id, _, _, error = _requester_from_payload(payload)
    if error:
        return error

    from app.db import DbCharacter, DbContactMessage, DbContactParticipant, DbContactThread, db
    from sqlalchemy import func as _func

    sender_name = str(payload.get('senderCharacterName', '')).strip()
    body = str(payload.get('body', '')).strip()
    if not sender_name:
        return jsonify({'error': 'senderCharacterName is required'}), 400
    if not body:
        return jsonify({'error': 'body is required'}), 400

    thread = DbContactThread.query.get(thread_id)
    if not thread:
        return jsonify({'error': 'Thread not found'}), 404

    sender = DbCharacter.query.filter(_func.lower(DbCharacter.character_name) == sender_name.lower()).first()
    if not sender or not sender.active:
        return jsonify({'error': f'No active character found named "{sender_name}"'}), 404
    if not _requester_can_access_character(sender, effective_discord_id):
        return _forbidden('You can only reply from your own character')

    participant = DbContactParticipant.query.filter_by(thread_id=thread.id, character_id=sender.id).first()
    if not participant:
        return jsonify({'error': 'Your character is not part of this conversation'}), 403

    message = DbContactMessage(thread_id=thread.id, sender_character_id=sender.id, body=body)
    thread.last_message_at = datetime.now(timezone.utc)
    db.session.add(message)
    db.session.commit()

    other_participants = [
        {'character_name': p.character.character_name, 'discord_id': p.character.player_discord or ''}
        for p in thread.participants
        if p.character_id != sender.id
    ]

    return jsonify({
        'ok': True,
        'message': {'id': message.id, 'sender_character_name': sender.character_name, 'body': body},
        'other_participants': other_participants,
    }), 201
