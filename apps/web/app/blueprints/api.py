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
        'BOT_NOTION_SYNC_REQUESTED': 'notionSyncRequested',
    }
    INT_KEYS = {
        'BOT_PASSAGE_OF_TIME_INTERVAL_MS': 'passageOfTimeIntervalMs',
        'BOT_REVIEW_NOTIFIER_INTERVAL_MS': 'reviewNotifierIntervalMs',
        'BOT_SUBMISSION_NOTIFIER_INTERVAL_MS': 'submissionNotifierIntervalMs',
        'BOT_CLAIM_REMINDER_INTERVAL_MS': 'claimReminderIntervalMs',
    }
    STR_KEYS = {
        'BOT_ANNOUNCEMENTS_CHANNEL_ID': 'announcementsChannelId',
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
    from app.db import AppSetting, db
    ts = datetime.now(timezone.utc).isoformat()
    record = db.session.get(AppSetting, 'BOT_LAST_HEARTBEAT')
    if record:
        record.value = ts
        record.updated_at = datetime.now(timezone.utc)
        record.updated_by = 'bot'
    else:
        record = AppSetting(key='BOT_LAST_HEARTBEAT', value=ts, updated_by='bot')
        db.session.add(record)

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
        'notionSyncCapable': 'BOT_LIVE_NOTION_SYNC_CAPABLE',
    }
    body = request.get_json(silent=True) or {}
    live_records = {r.key: r for r in AppSetting.query.filter(AppSetting.key.in_(LIVE_FLAG_KEYS.values())).all()}
    for field, db_key in LIVE_FLAG_KEYS.items():
        if field not in body:
            continue
        val = 'true' if body[field] else 'false'
        if db_key in live_records:
            live_records[db_key].value = val
            live_records[db_key].updated_by = 'bot'
        else:
            db.session.add(AppSetting(key=db_key, value=val, updated_by='bot'))

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
            current_dots=current_dots,
            new_dots=new_dots,
            is_in_clan=is_in_clan,
            justification=justification,
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


@bp.route('/notion-sync-ack', methods=['POST'])
@require_bot_scope('write')
@_limit('30 per minute')
def notion_sync_ack():
    """Bot calls this to report Notion sync status."""
    from datetime import datetime, timezone
    from app.db import AppSetting, NotionSyncEvent, db
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
            delete_key('BOT_NOTION_SYNC_REQUESTED')
        upsert('BOT_NOTION_SYNC_STATUS', 'running')
        upsert('BOT_NOTION_SYNC_SOURCE', source)
        if run_id:
            upsert('BOT_NOTION_SYNC_RUN_ID', run_id)
        else:
            delete_key('BOT_NOTION_SYNC_RUN_ID')
        upsert('BOT_NOTION_SYNC_STARTED_AT', now)
        delete_key('BOT_NOTION_SYNC_FINISHED_AT')
        delete_key('BOT_NOTION_SYNC_ERROR')
    elif status == 'success':
        upsert('BOT_NOTION_SYNC_STATUS', 'success')
        upsert('BOT_NOTION_SYNC_SOURCE', source)
        if run_id:
            upsert('BOT_NOTION_SYNC_RUN_ID', run_id)
        else:
            delete_key('BOT_NOTION_SYNC_RUN_ID')
        upsert('BOT_NOTION_SYNC_FINISHED_AT', now)
        delete_key('BOT_NOTION_SYNC_ERROR')
    else:
        upsert('BOT_NOTION_SYNC_STATUS', 'error')
        upsert('BOT_NOTION_SYNC_SOURCE', source)
        if run_id:
            upsert('BOT_NOTION_SYNC_RUN_ID', run_id)
        else:
            delete_key('BOT_NOTION_SYNC_RUN_ID')
        upsert('BOT_NOTION_SYNC_FINISHED_AT', now)
        upsert('BOT_NOTION_SYNC_ERROR', data.get('error', 'unknown error'))

    db.session.add(
        NotionSyncEvent(
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
        db.session.query(NotionSyncEvent.id)
        .order_by(NotionSyncEvent.created_at.desc())
        .offset(500)
        .limit(1)
        .scalar()
    )
    if cutoff_query:
        db.session.query(NotionSyncEvent).filter(NotionSyncEvent.id <= cutoff_query).delete()
        db.session.commit()

    return jsonify({'ok': True})


@bp.route('/bot-log', methods=['POST'])
@require_bot_scope('write')
@_limit('120 per minute')
def bot_log():
    """Bot forwards its warn/error log entries here for persistent storage."""
    from datetime import datetime, timezone
    from app.db import AppLogEntry, db
    entries = request.get_json(silent=True) or []
    if not isinstance(entries, list):
        return jsonify({'error': 'expected a JSON array'}), 400
    now = datetime.now(timezone.utc)
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
        db.session.add(AppLogEntry(
            ts=ts, source='bot', level=level, event=event,
            message=msg[:2000], details=details[:4000], created_at=now,
        ))
    db.session.commit()
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
    """Create or update a wiki page (used by the Notion/Discord sync script)."""
    from datetime import datetime, timezone
    from app.db import db, WikiPage
    data = request.get_json(silent=True) or {}
    slug = (data.get('slug') or '').strip()
    title = (data.get('title') or '').strip()
    if not slug or not title:
        return jsonify({'error': 'slug and title are required'}), 400

    from app.gcs import mirror_to_gcs, is_discord_cdn_url
    from flask import current_app as _app

    def _resolve_cover(url: str, page_slug: str) -> str:
        """Upload Discord CDN images to GCS; return permanent URL."""
        if not url or not is_discord_cdn_url(url):
            return url
        return mirror_to_gcs(
            url=url,
            slug=page_slug,
            bucket_name=_app.config.get('GCS_BUCKET_NAME', 'mcbn-wiki-images'),
            credentials_json=_app.config.get('GOOGLE_CREDENTIALS_JSON', ''),
            credentials_file=_app.config.get('GOOGLE_CREDENTIALS_FILE', ''),
        )

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
            p.body_markdown = data['body_markdown']
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
        body_markdown=data.get('body_markdown', ''),
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
    row.status = new_status
    row.active = (new_status == 'active')
    db.session.commit()
    return jsonify({'status': 'updated', 'character': row.character_name, 'new_status': new_status})


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
