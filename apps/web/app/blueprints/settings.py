"""Staff settings overview — read-only view of current configuration.

Settings admins (SETTINGS_ADMIN_DISCORD_IDS) may also toggle feature flags
and update tuning parameters at runtime without a redeploy.
"""

from datetime import datetime, timezone

from flask import (
    Blueprint, current_app, flash, redirect, render_template, request, session, url_for
)
from app.auth import require_staff, is_settings_admin
from app.app_settings import (
    EDITABLE_KEYS,
    delete_app_setting,
    get_all_overrides,
    get_app_setting,
    set_app_setting,
)
from app.bot_commands_catalog import BOT_COMMAND_CATALOG, flattened_tokens
from app.db import RetirementAutomationJob
from app.retirement_automation import retirement_next_retry_at

bp = Blueprint('settings', __name__)


def _parse_iso_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _format_duration(seconds: int | None) -> str:
    if seconds is None or seconds < 0:
        return '—'
    hours, rem = divmod(seconds, 3600)
    minutes, secs = divmod(rem, 60)
    if hours:
        return f'{hours}h {minutes}m {secs}s'
    if minutes:
        return f'{minutes}m {secs}s'
    return f'{secs}s'


def _is_truthy(value: str | None) -> bool:
    return str(value or '').strip().lower() in ('true', '1', 'yes')


@bp.route('/')
@require_staff
def index():
    if not is_settings_admin():
        flash('Settings is restricted to Administrators.', 'danger')
        return redirect(url_for('roster.index'))
    cfg = current_app.config
    overrides = get_all_overrides()
    can_edit = True

    def _eff_bool(key, env_default):
        return get_app_setting(key, env_default)

    def _eff_int(key, env_default):
        return get_app_setting(key, env_default)

    # ── Web app feature flags ──────────────────────────────────────────────
    web_flags = [
        {
            'label': 'Auto-Create Periods',
            'key': 'AUTO_CREATE_PERIODS_ENABLED',
            'env': 'AUTO_CREATE_PERIODS_ENABLED',
            'enabled': _eff_bool('AUTO_CREATE_PERIODS_ENABLED', bool(cfg.get('AUTO_CREATE_PERIODS_ENABLED'))),
            'overridden': 'AUTO_CREATE_PERIODS_ENABLED' in overrides,
            'editable': True,
            'description': 'Automatically creates the next play period when due.',
        },
        {
            'label': 'Auto-Close Periods',
            'key': 'AUTO_CLOSE_PERIODS_ENABLED',
            'env': 'AUTO_CLOSE_PERIODS_ENABLED',
            'enabled': _eff_bool('AUTO_CLOSE_PERIODS_ENABLED', bool(cfg.get('AUTO_CLOSE_PERIODS_ENABLED'))),
            'overridden': 'AUTO_CLOSE_PERIODS_ENABLED' in overrides,
            'editable': True,
            'description': 'Closes the current period after its end date and queues reminder DMs.',
        },
        {
            'label': 'Bot API Replay Protection',
            'key': 'BOT_API_REPLAY_PROTECTION_ENABLED',
            'env': 'BOT_API_REPLAY_PROTECTION_ENABLED',
            'enabled': _eff_bool('BOT_API_REPLAY_PROTECTION_ENABLED', bool(cfg.get('BOT_API_REPLAY_PROTECTION_ENABLED'))),
            'overridden': 'BOT_API_REPLAY_PROTECTION_ENABLED' in overrides,
            'editable': True,
            'description': 'Requires nonce + timestamp headers on write endpoints to prevent replay attacks.',
        },
        {
            'label': 'Sheets Header Validation',
            'key': 'SHEETS_VALIDATE_HEADERS_ON_STARTUP',
            'env': 'SHEETS_VALIDATE_HEADERS_ON_STARTUP',
            'enabled': bool(cfg.get('SHEETS_VALIDATE_HEADERS_ON_STARTUP')),
            'overridden': False,
            'editable': False,
            'description': 'Validates Google Sheets column headers on app startup. Requires restart to change.',
        },
        {
            'label': 'Local Status Page',
            'key': 'LOCAL_STATUS_ENABLED',
            'env': 'LOCAL_STATUS_ENABLED',
            'enabled': bool(cfg.get('LOCAL_STATUS_ENABLED')),
            'overridden': False,
            'editable': False,
            'description': 'Enables the /local/status diagnostics page (localhost only). Requires restart to change.',
        },
    ]

    # ── Web app tuning ─────────────────────────────────────────────────────
    web_tuning = [
        {
            'label': 'Period open lead days',
            'key': 'AUTO_CREATE_PERIODS_OPEN_LEAD_DAYS',
            'env': 'AUTO_CREATE_PERIODS_OPEN_LEAD_DAYS',
            'value': _eff_int('AUTO_CREATE_PERIODS_OPEN_LEAD_DAYS', cfg.get('AUTO_CREATE_PERIODS_OPEN_LEAD_DAYS', 1)),
            'overridden': 'AUTO_CREATE_PERIODS_OPEN_LEAD_DAYS' in overrides,
            'editable': True,
            'description': 'Days before the current period ends to open the next one.',
        },
        {
            'label': 'Default period length',
            'key': 'AUTO_CREATE_PERIODS_DEFAULT_LENGTH_DAYS',
            'env': 'AUTO_CREATE_PERIODS_DEFAULT_LENGTH_DAYS',
            'value': _eff_int('AUTO_CREATE_PERIODS_DEFAULT_LENGTH_DAYS', cfg.get('AUTO_CREATE_PERIODS_DEFAULT_LENGTH_DAYS', 14)),
            'overridden': 'AUTO_CREATE_PERIODS_DEFAULT_LENGTH_DAYS' in overrides,
            'editable': True,
            'description': 'Default length of a new period in days.',
        },
        {
            'label': 'Default period gap',
            'key': 'AUTO_CREATE_PERIODS_DEFAULT_GAP_DAYS',
            'env': 'AUTO_CREATE_PERIODS_DEFAULT_GAP_DAYS',
            'value': _eff_int('AUTO_CREATE_PERIODS_DEFAULT_GAP_DAYS', cfg.get('AUTO_CREATE_PERIODS_DEFAULT_GAP_DAYS', 0)),
            'overridden': 'AUTO_CREATE_PERIODS_DEFAULT_GAP_DAYS' in overrides,
            'editable': True,
            'description': 'Days between end of one period and start of the next.',
        },
        {
            'label': 'Replay protection window',
            'key': 'BOT_API_REPLAY_WINDOW_SECONDS',
            'env': 'BOT_API_REPLAY_WINDOW_SECONDS',
            'value': _eff_int('BOT_API_REPLAY_WINDOW_SECONDS', cfg.get('BOT_API_REPLAY_WINDOW_SECONDS', 300)),
            'overridden': 'BOT_API_REPLAY_WINDOW_SECONDS' in overrides,
            'editable': True,
            'description': 'Seconds within which a bot request timestamp must fall.',
        },
        {
            'label': 'Nonce TTL',
            'key': 'BOT_API_NONCE_TTL_SECONDS',
            'env': 'BOT_API_NONCE_TTL_SECONDS',
            'value': _eff_int('BOT_API_NONCE_TTL_SECONDS', cfg.get('BOT_API_NONCE_TTL_SECONDS', 600)),
            'overridden': 'BOT_API_NONCE_TTL_SECONDS' in overrides,
            'editable': True,
            'description': 'How long a nonce is remembered to detect replays.',
        },
        {
            'label': 'Wiki sync stale threshold',
            'key': 'BOT_WIKI_SYNC_STALE_AFTER_SECONDS',
            'env': 'BOT_WIKI_SYNC_STALE_AFTER_SECONDS',
            'value': _eff_int('BOT_WIKI_SYNC_STALE_AFTER_SECONDS', cfg.get('BOT_WIKI_SYNC_STALE_AFTER_SECONDS', 3600)),
            'overridden': 'BOT_WIKI_SYNC_STALE_AFTER_SECONDS' in overrides,
            'editable': True,
            'description': 'Marks Wiki sync as stale after this many seconds in running state.',
        },
        {
            'label': 'Session lifetime',
            'key': 'SESSION_LIFETIME_SECONDS',
            'env': 'SESSION_LIFETIME_SECONDS',
            'value': int(cfg.get('PERMANENT_SESSION_LIFETIME').total_seconds()),
            'overridden': False,
            'editable': False,
            'description': 'Staff login session duration in seconds. Requires restart to change.',
        },
        {
            'label': 'Sheets cache TTL',
            'key': 'SHEETS_CACHE_TTL',
            'env': 'SHEETS_CACHE_TTL',
            'value': _eff_int('SHEETS_CACHE_TTL', cfg.get('SHEETS_CACHE_TTL', 30)),
            'overridden': 'SHEETS_CACHE_TTL' in overrides,
            'editable': True,
            'description': 'How long Google Sheets reads are cached (seconds).',
        },
    ]

    # ── Integration status (configured / not configured) ───────────────────
    integrations = [
        {
            'label': 'Google Sheets backup',
            'configured': bool(cfg.get('SPREADSHEET_ID')),
            'description': 'Mirrors writes to a Google Sheet as a backup.',
        },
        {
            'label': 'Bot API (legacy token)',
            'configured': bool(cfg.get('WEB_APP_API_TOKEN')),
            'description': 'Single all-scope token for bot API access.',
        },
        {
            'label': 'Bot API read token',
            'configured': bool(cfg.get('WEB_APP_API_READ_TOKEN')),
            'description': 'Read-scoped token for bot API access.',
        },
        {
            'label': 'Bot API write token',
            'configured': bool(cfg.get('WEB_APP_API_WRITE_TOKEN')),
            'description': 'Write-scoped token for bot API access.',
        },
        {
            'label': 'Turso (cloud database)',
            'configured': bool(cfg.get('TURSO_CONNECT_URL')),
            'description': 'libSQL/Turso remote database (production). SQLite used when not configured.',
        },
    ]

    # ── Bot feature flags (DB-backed; bot polls /api/bot-config) ──────────────
    LIVE_KEY_MAP = {
        'BOT_REVIEW_NOTIFIER_ENABLED': 'BOT_LIVE_REVIEW_NOTIFIER_ENABLED',
        'BOT_SUBMISSION_NOTIFIER_ENABLED': 'BOT_LIVE_SUBMISSION_NOTIFIER_ENABLED',
        'BOT_AUTO_PERIOD_CREATOR_ENABLED': 'BOT_LIVE_AUTO_PERIOD_CREATOR_ENABLED',
        'BOT_AUTO_PERIOD_CLOSER_ENABLED': 'BOT_LIVE_AUTO_PERIOD_CLOSER_ENABLED',
        'BOT_CLAIM_REMINDER_ENABLED': 'BOT_LIVE_CLAIM_REMINDER_ENABLED',
        'BOT_PASSAGE_OF_TIME_ENABLED': 'BOT_LIVE_PASSAGE_OF_TIME_ENABLED',
        'BOT_HUNT_CONSEQUENCE_ENABLED': 'BOT_LIVE_HUNT_CONSEQUENCE_ENABLED',
        'BOT_CC_TICKET_MONITOR_ENABLED': 'BOT_LIVE_CC_TICKET_MONITOR_ENABLED',
    }
    from app.db import AppSetting, WikiSyncEvent
    live_keys = list(LIVE_KEY_MAP.values())
    live_records = {r.key: r for r in AppSetting.query.filter(AppSetting.key.in_(live_keys)).all()}

    def _bot_flag_status(key, overrides):
        db_record = overrides.get(key)
        live_key = LIVE_KEY_MAP.get(key)
        live_record = live_records.get(live_key) if live_key else None
        live_enabled = live_record.value.lower() in ('true', '1', 'yes') if live_record else None
        if db_record is None:
            # No DB override — show the bot's actual reported live state.
            return {
                'db_set': False,
                'enabled': live_enabled if live_enabled is not None else False,
                'live_known': live_enabled is not None,
                'using_env': live_enabled is None,
            }
        db_enabled = db_record.value.lower() in ('true', '1', 'yes')
        return {
            'db_set': True,
            'enabled': db_enabled,
            'live_known': live_enabled is not None,
            'using_env': False,
        }

    bot_flags = [
        {
            'label': 'Review Notifier',
            'key': 'BOT_REVIEW_NOTIFIER_ENABLED',
            'env': 'REVIEW_NOTIFIER_ENABLED',
            'interval_env': 'REVIEW_NOTIFIER_INTERVAL_MS',
            'description': 'Posts claim/spend approval and denial notices into character cubby channels.',
            'editable': True,
            **_bot_flag_status('BOT_REVIEW_NOTIFIER_ENABLED', overrides),
        },
        {
            'label': 'Submission Notifier',
            'key': 'BOT_SUBMISSION_NOTIFIER_ENABLED',
            'env': 'SUBMISSION_NOTIFIER_ENABLED',
            'interval_env': 'SUBMISSION_NOTIFIER_INTERVAL_MS',
            'description': 'Posts new claim and spend submissions to a staff channel.',
            'editable': True,
            **_bot_flag_status('BOT_SUBMISSION_NOTIFIER_ENABLED', overrides),
        },
        {
            'label': 'Auto-Create Periods',
            'key': 'BOT_AUTO_PERIOD_CREATOR_ENABLED',
            'env': 'AUTO_PERIOD_CREATOR_ENABLED',
            'interval_env': 'AUTO_PERIOD_CREATOR_INTERVAL_MS',
            'description': 'Bot triggers web-side period creation on a schedule.',
            'editable': True,
            **_bot_flag_status('BOT_AUTO_PERIOD_CREATOR_ENABLED', overrides),
        },
        {
            'label': 'Auto-Close Periods',
            'key': 'BOT_AUTO_PERIOD_CLOSER_ENABLED',
            'env': 'AUTO_PERIOD_CLOSER_ENABLED',
            'interval_env': 'AUTO_PERIOD_CLOSER_INTERVAL_MS',
            'description': 'Bot triggers web-side period close and sends DMs to non-submitters.',
            'editable': True,
            **_bot_flag_status('BOT_AUTO_PERIOD_CLOSER_ENABLED', overrides),
        },
        {
            'label': 'Claim Reminders',
            'key': 'BOT_CLAIM_REMINDER_ENABLED',
            'env': 'CLAIM_REMINDER_ENABLED',
            'interval_env': 'CLAIM_REMINDER_INTERVAL_MS',
            'description': "DMs players with active characters who haven't filed a claim for the current period.",
            'editable': True,
            **_bot_flag_status('BOT_CLAIM_REMINDER_ENABLED', overrides),
        },
        {
            'label': 'Passage of Time',
            'key': 'BOT_PASSAGE_OF_TIME_ENABLED',
            'env': 'PASSAGE_OF_TIME_ENABLED',
            'interval_env': 'PASSAGE_OF_TIME_INTERVAL_MS',
            'description': 'Posts sunrise, sunset, and downtime messages on a fortnightly/bi-monthly cadence.',
            'editable': True,
            **_bot_flag_status('BOT_PASSAGE_OF_TIME_ENABLED', overrides),
        },
        {
            'label': 'Hunt Consequence Monitor',
            'key': 'BOT_HUNT_CONSEQUENCE_ENABLED',
            'env': 'HUNT_CONSEQUENCE_ENABLED',
            'interval_env': None,
            'description': 'Monitors designated channels for hunt posts and routes consequence rolls to staff.',
            'editable': True,
            **_bot_flag_status('BOT_HUNT_CONSEQUENCE_ENABLED', overrides),
        },
        {
            'label': 'CC Ticket Monitor',
            'key': 'BOT_CC_TICKET_MONITOR_ENABLED',
            'env': 'CC_TICKET_MONITOR_ENABLED',
            'interval_env': None,
            'description': 'Posts a welcome message with a character creator link when a new ticket opens under the CC category.',
            'editable': True,
            **_bot_flag_status('BOT_CC_TICKET_MONITOR_ENABLED', overrides),
        },
        {
            'label': 'Honeypot Moderation',
            'key': 'BOT_HONEYPOT_ENABLED',
            'env': 'HONEYPOT_ENABLED',
            'interval_env': None,
            'description': 'Bans anyone who posts in the hidden bait channel. See Channel IDs below to configure the channel.',
            'editable': True,
            **_bot_flag_status('BOT_HONEYPOT_ENABLED', overrides),
        },
        {
            'label': 'Honeypot: require young account',
            'key': 'BOT_HONEYPOT_REQUIRE_YOUNG_ACCOUNT',
            'env': 'HONEYPOT_REQUIRE_YOUNG_ACCOUNT',
            'interval_env': None,
            'description': 'If on, only bans honeypot triggers younger than the configured max account age (see Tuning below).',
            'editable': True,
            **_bot_flag_status('BOT_HONEYPOT_REQUIRE_YOUNG_ACCOUNT', overrides),
        },
        {
            'label': 'Mention-Spam Circuit Breaker',
            'key': 'BOT_MENTION_BREAKER_ENABLED',
            'env': 'MENTION_BREAKER_ENABLED',
            'interval_env': None,
            'description': 'Deletes and times out authors of messages with too many unique mentions. Backstop to Discord AutoMod.',
            'editable': True,
            **_bot_flag_status('BOT_MENTION_BREAKER_ENABLED', overrides),
        },
        {
            'label': 'New Member Gate',
            'key': 'BOT_NEW_MEMBER_GATE_ENABLED',
            'env': 'NEW_MEMBER_GATE_ENABLED',
            'interval_env': None,
            'description': 'Requires new members to post a hello in the welcome channel before offering player/lurker roles. See Channel IDs below to configure the welcome channel and roles. Only takes effect if NEW_MEMBER_GATE_ENABLED=true was also set in the bot\'s .env at least once (secures the privileged Discord intent this needs) — ask staff with server access if this toggle doesn\'t seem to do anything.',
            'editable': True,
            **_bot_flag_status('BOT_NEW_MEMBER_GATE_ENABLED', overrides),
        },
        {
            'label': 'New Night Broadcast',
            'key': 'BOT_NEW_NIGHT_BROADCAST_ENABLED',
            'env': 'PASSAGE_NEW_NIGHT_BROADCAST_ENABLED',
            'interval_env': None,
            'description': 'Posts a short message (see Channel IDs below) to every channel in the City of Nashville, Elysium, Event Locations, and Active Coteries categories when the sunset event fires — separate from the full announcement in #passage-of-time.',
            'editable': True,
            **_bot_flag_status('BOT_NEW_NIGHT_BROADCAST_ENABLED', overrides),
        },
    ]

    # ── Bot command kill switches (DB-backed CSV; polled by bot via /api/bot-config) ──
    _disabled_raw = get_app_setting('BOT_DISABLED_COMMANDS', '')
    _disabled_tokens = {t.strip() for t in _disabled_raw.split(',') if t.strip()}

    bot_commands = []
    for _cmd in BOT_COMMAND_CATALOG:
        _cmd_disabled = _cmd['name'] in _disabled_tokens
        subcommands = []
        for _sub in _cmd['subcommands']:
            _sub_token = f"{_cmd['name']}.{_sub['name']}"
            subcommands.append({
                'token': _sub_token,
                'label': _sub['label'],
                'description': _sub['description'],
                'own_disabled': _sub_token in _disabled_tokens,
                'disabled': _cmd_disabled or _sub_token in _disabled_tokens,
                'inherited': _cmd_disabled and _sub_token not in _disabled_tokens,
            })
        bot_commands.append({
            'token': _cmd['name'],
            'label': _cmd['label'],
            'description': _cmd['description'],
            'disabled': _cmd_disabled,
            'subcommands': subcommands,
        })

    # ── Bot channel IDs (DB-backed; take effect after bot restart) ────────
    def _eff_str(key):
        record = overrides.get(key)
        return record.value.strip() if record else None

    bot_channels = [
        {
            'label': 'Announcements channel',
            'key': 'BOT_ANNOUNCEMENTS_CHANNEL_ID',
            'env': 'ANNOUNCEMENTS_CHANNEL_ID',
            'value': _eff_str('BOT_ANNOUNCEMENTS_CHANNEL_ID'),
            'placeholder': 'Discord channel ID (18–19 digits)',
            'input_pattern': r'\d{17,20}',
            'overridden': 'BOT_ANNOUNCEMENTS_CHANNEL_ID' in overrides,
            'editable': True,
            'description': 'Channel ID for /lasombra broadcast → announcements target.',
        },
        {
            'label': 'CC ticket category IDs',
            'key': 'BOT_CC_TICKET_CATEGORY_IDS',
            'env': 'CC_TICKET_CATEGORY_IDS',
            'value': _eff_str('BOT_CC_TICKET_CATEGORY_IDS'),
            'placeholder': 'e.g. 123456789012345678,987654321098765432',
            'input_pattern': None,
            'overridden': 'BOT_CC_TICKET_CATEGORY_IDS' in overrides,
            'editable': True,
            'description': 'Restrict the CC ticket monitor to these Discord category IDs (comma-separated). Leave blank to match any category named "character tickets".',
        },
        {
            'label': 'Honeypot bait channel',
            'key': 'BOT_HONEYPOT_CHANNEL_ID',
            'env': 'HONEYPOT_CHANNEL_ID',
            'value': _eff_str('BOT_HONEYPOT_CHANNEL_ID'),
            'placeholder': 'Discord channel ID (18–19 digits)',
            'input_pattern': r'\d{17,20}',
            'overridden': 'BOT_HONEYPOT_CHANNEL_ID' in overrides,
            'editable': True,
            'description': 'Hidden channel only unverified accounts can see. Anyone who posts here is deleted + banned.',
        },
        {
            'label': 'Honeypot mod-log channel',
            'key': 'BOT_HONEYPOT_MOD_LOG_CHANNEL_ID',
            'env': 'HONEYPOT_MOD_LOG_CHANNEL_ID',
            'value': _eff_str('BOT_HONEYPOT_MOD_LOG_CHANNEL_ID'),
            'placeholder': 'Discord channel ID (18–19 digits)',
            'input_pattern': r'\d{17,20}',
            'overridden': 'BOT_HONEYPOT_MOD_LOG_CHANNEL_ID' in overrides,
            'editable': True,
            'description': 'Private staff channel where honeypot ban audit embeds are posted.',
        },
        {
            'label': 'Honeypot whitelisted role IDs',
            'key': 'BOT_HONEYPOT_WHITELISTED_ROLE_IDS',
            'env': 'HONEYPOT_WHITELISTED_ROLE_IDS',
            'value': _eff_str('BOT_HONEYPOT_WHITELISTED_ROLE_IDS'),
            'placeholder': 'e.g. 123456789012345678,987654321098765432',
            'input_pattern': None,
            'overridden': 'BOT_HONEYPOT_WHITELISTED_ROLE_IDS' in overrides,
            'editable': True,
            'description': 'Role IDs that are never banned by the honeypot (comma-separated) — e.g. staff roles, for safe testing.',
        },
        {
            'label': 'Mention breaker exempt role IDs',
            'key': 'BOT_MENTION_BREAKER_EXEMPT_ROLE_IDS',
            'env': 'MENTION_BREAKER_EXEMPT_ROLE_IDS',
            'value': _eff_str('BOT_MENTION_BREAKER_EXEMPT_ROLE_IDS'),
            'placeholder': 'e.g. 123456789012345678,987654321098765432',
            'input_pattern': None,
            'overridden': 'BOT_MENTION_BREAKER_EXEMPT_ROLE_IDS' in overrides,
            'editable': True,
            'description': 'Role IDs exempt from the mention-spam circuit breaker (comma-separated) — e.g. staff roles.',
        },
        {
            'label': 'Mention breaker mod-log channel',
            'key': 'BOT_MENTION_BREAKER_MOD_LOG_CHANNEL_ID',
            'env': 'MENTION_BREAKER_MOD_LOG_CHANNEL_ID',
            'value': _eff_str('BOT_MENTION_BREAKER_MOD_LOG_CHANNEL_ID'),
            'placeholder': 'Discord channel ID (18–19 digits)',
            'input_pattern': r'\d{17,20}',
            'overridden': 'BOT_MENTION_BREAKER_MOD_LOG_CHANNEL_ID' in overrides,
            'editable': True,
            'description': 'Channel for mention-spam breaker alerts. Leave blank to reuse the honeypot mod-log channel.',
        },
        {
            'label': 'Verified member role',
            'key': 'BOT_VERIFIED_MEMBER_ROLE_ID',
            'env': 'VERIFIED_MEMBER_ROLE_ID',
            'value': _eff_str('BOT_VERIFIED_MEMBER_ROLE_ID'),
            'placeholder': 'Discord role ID (18–19 digits)',
            'input_pattern': r'\d{17,20}',
            'overridden': 'BOT_VERIFIED_MEMBER_ROLE_ID' in overrides,
            'editable': True,
            'description': 'Base/verified member role ("The Washed Masses") — used by /lasombra permissions audit to assert the honeypot channel stays hidden from real members, and granted to anyone who completes the New Member Gate below.',
        },
        {
            'label': 'New Member Gate: welcome channel',
            'key': 'BOT_NEW_MEMBER_GATE_WELCOME_CHANNEL_ID',
            'env': 'NEW_MEMBER_GATE_WELCOME_CHANNEL_ID',
            'value': _eff_str('BOT_NEW_MEMBER_GATE_WELCOME_CHANNEL_ID'),
            'placeholder': 'Discord channel ID (18–19 digits)',
            'input_pattern': r'\d{17,20}',
            'overridden': 'BOT_NEW_MEMBER_GATE_WELCOME_CHANNEL_ID' in overrides,
            'editable': True,
            'description': 'New members are greeted here on join and must post a message here to be offered player/lurker roles.',
        },
        {
            'label': 'New Member Gate: player role (Sheet in Progress)',
            'key': 'BOT_NEW_MEMBER_GATE_SHEET_IN_PROGRESS_ROLE_ID',
            'env': 'NEW_MEMBER_GATE_SHEET_IN_PROGRESS_ROLE_ID',
            'value': _eff_str('BOT_NEW_MEMBER_GATE_SHEET_IN_PROGRESS_ROLE_ID'),
            'placeholder': 'Discord role ID (18–19 digits)',
            'input_pattern': r'\d{17,20}',
            'overridden': 'BOT_NEW_MEMBER_GATE_SHEET_IN_PROGRESS_ROLE_ID' in overrides,
            'editable': True,
            'description': 'Granted (alongside the verified member role above) to a new member who chooses "work towards making a character."',
        },
        {
            'label': 'New Member Gate: lurker role',
            'key': 'BOT_NEW_MEMBER_GATE_LURKER_ROLE_ID',
            'env': 'NEW_MEMBER_GATE_LURKER_ROLE_ID',
            'value': _eff_str('BOT_NEW_MEMBER_GATE_LURKER_ROLE_ID'),
            'placeholder': 'Discord role ID (18–19 digits)',
            'input_pattern': r'\d{17,20}',
            'overridden': 'BOT_NEW_MEMBER_GATE_LURKER_ROLE_ID' in overrides,
            'editable': True,
            'description': 'Granted (alongside the verified member role above) to a new member who chooses "just lurk for now."',
        },
        {
            'label': 'New Night Broadcast: message',
            'key': 'BOT_NEW_NIGHT_BROADCAST_MESSAGE',
            'env': 'PASSAGE_NEW_NIGHT_BROADCAST_MESSAGE',
            'value': _eff_str('BOT_NEW_NIGHT_BROADCAST_MESSAGE'),
            'placeholder': 'A GIF link or short message, e.g. https://klipy.com/gifs/africa-sunset',
            'input_pattern': None,
            'overridden': 'BOT_NEW_NIGHT_BROADCAST_MESSAGE' in overrides,
            'editable': True,
            'description': 'Posted to every channel in the new-night broadcast categories when the sunset event fires (see New Night Broadcast above). A bare link works — Discord auto-embeds it.',
        },
        {
            'label': 'Correspondence: Deliver channel',
            'key': 'BOT_CORRESPONDENCE_DELIVERY_CHANNEL_ID',
            'env': 'CORRESPONDENCE_DELIVERY_CHANNEL_ID',
            'value': _eff_str('BOT_CORRESPONDENCE_DELIVERY_CHANNEL_ID'),
            'placeholder': 'Discord channel ID (18–19 digits)',
            'input_pattern': r'\d{17,20}',
            'overridden': 'BOT_CORRESPONDENCE_DELIVERY_CHANNEL_ID' in overrides,
            'editable': True,
            'description': '/deliver posts hand-delivered letters here. Leave blank to disable the command.',
        },
        {
            'label': 'Correspondence: Contact channel',
            'key': 'BOT_CORRESPONDENCE_CONTACT_CHANNEL_ID',
            'env': 'CORRESPONDENCE_CONTACT_CHANNEL_ID',
            'value': _eff_str('BOT_CORRESPONDENCE_CONTACT_CHANNEL_ID'),
            'placeholder': 'Discord channel ID (18–19 digits)',
            'input_pattern': r'\d{17,20}',
            'overridden': 'BOT_CORRESPONDENCE_CONTACT_CHANNEL_ID' in overrides,
            'editable': True,
            'description': '/contact send|reply posts text-message threads here. Leave blank to disable the command.',
        },
        {
            'label': 'Correspondence: Prestation channel',
            'key': 'BOT_CORRESPONDENCE_PRESTATION_CHANNEL_ID',
            'env': 'CORRESPONDENCE_PRESTATION_CHANNEL_ID',
            'value': _eff_str('BOT_CORRESPONDENCE_PRESTATION_CHANNEL_ID'),
            'placeholder': 'Discord channel ID (18–19 digits)',
            'input_pattern': r'\d{17,20}',
            'overridden': 'BOT_CORRESPONDENCE_PRESTATION_CHANNEL_ID' in overrides,
            'editable': True,
            'description': '/prestation owe|status|repay posts the boon ledger here. Leave blank to disable the command.',
        },
        {
            'label': 'Correspondence: Social channel',
            'key': 'BOT_CORRESPONDENCE_SOCIAL_CHANNEL_ID',
            'env': 'CORRESPONDENCE_SOCIAL_CHANNEL_ID',
            'value': _eff_str('BOT_CORRESPONDENCE_SOCIAL_CHANNEL_ID'),
            'placeholder': 'Discord channel ID (18–19 digits)',
            'input_pattern': r'\d{17,20}',
            'overridden': 'BOT_CORRESPONDENCE_SOCIAL_CHANNEL_ID' in overrides,
            'editable': True,
            'description': '/post posts in-character social media posts here. Leave blank to disable the command.',
        },
        {
            'label': 'Correspondence: Cobweb channel',
            'key': 'BOT_CORRESPONDENCE_COBWEB_CHANNEL_ID',
            'env': 'CORRESPONDENCE_COBWEB_CHANNEL_ID',
            'value': _eff_str('BOT_CORRESPONDENCE_COBWEB_CHANNEL_ID'),
            'placeholder': 'Discord channel ID (18–19 digits)',
            'input_pattern': r'\d{17,20}',
            'overridden': 'BOT_CORRESPONDENCE_COBWEB_CHANNEL_ID' in overrides,
            'editable': True,
            'description': '/cobweb posts Malkavian telepathic broadcasts here. Leave blank to disable the command.',
        },
        {
            'label': 'Correspondence: Rumor channel',
            'key': 'BOT_CORRESPONDENCE_RUMOR_CHANNEL_ID',
            'env': 'CORRESPONDENCE_RUMOR_CHANNEL_ID',
            'value': _eff_str('BOT_CORRESPONDENCE_RUMOR_CHANNEL_ID'),
            'placeholder': 'Discord channel ID (18–19 digits)',
            'input_pattern': r'\d{17,20}',
            'overridden': 'BOT_CORRESPONDENCE_RUMOR_CHANNEL_ID' in overrides,
            'editable': True,
            'description': '/rumor posts using the standard staff template here. Leave blank to disable the command.',
        },
    ]

    # ── Bot tuning (DB-backed; take effect after bot restart) ─────────────
    bot_tuning = [
        {
            'label': 'Passage of Time interval',
            'key': 'BOT_PASSAGE_OF_TIME_INTERVAL_MS',
            'env': 'PASSAGE_OF_TIME_INTERVAL_MS',
            'value': _eff_int('BOT_PASSAGE_OF_TIME_INTERVAL_MS', None),
            'placeholder': 300000,
            'overridden': 'BOT_PASSAGE_OF_TIME_INTERVAL_MS' in overrides,
            'editable': True,
            'description': 'How often the bot checks passage-of-time events (ms). Recommended: 300000.',
        },
        {
            'label': 'Review Notifier interval',
            'key': 'BOT_REVIEW_NOTIFIER_INTERVAL_MS',
            'env': 'REVIEW_NOTIFIER_INTERVAL_MS',
            'value': _eff_int('BOT_REVIEW_NOTIFIER_INTERVAL_MS', None),
            'placeholder': 120000,
            'overridden': 'BOT_REVIEW_NOTIFIER_INTERVAL_MS' in overrides,
            'editable': True,
            'description': 'How often the bot polls for newly reviewed claims/spends (ms).',
        },
        {
            'label': 'Submission Notifier interval',
            'key': 'BOT_SUBMISSION_NOTIFIER_INTERVAL_MS',
            'env': 'SUBMISSION_NOTIFIER_INTERVAL_MS',
            'value': _eff_int('BOT_SUBMISSION_NOTIFIER_INTERVAL_MS', None),
            'placeholder': 120000,
            'overridden': 'BOT_SUBMISSION_NOTIFIER_INTERVAL_MS' in overrides,
            'editable': True,
            'description': 'How often the bot polls for new XP/spend submissions (ms).',
        },
        {
            'label': 'Claim Reminder interval',
            'key': 'BOT_CLAIM_REMINDER_INTERVAL_MS',
            'env': 'CLAIM_REMINDER_INTERVAL_MS',
            'value': _eff_int('BOT_CLAIM_REMINDER_INTERVAL_MS', None),
            'placeholder': 900000,
            'overridden': 'BOT_CLAIM_REMINDER_INTERVAL_MS' in overrides,
            'editable': True,
            'description': 'How often the bot checks whether it is time to send claim reminders (ms).',
        },
        {
            'label': 'Honeypot max account age',
            'key': 'BOT_HONEYPOT_MAX_ACCOUNT_AGE_DAYS',
            'env': 'HONEYPOT_MAX_ACCOUNT_AGE_DAYS',
            'value': _eff_int('BOT_HONEYPOT_MAX_ACCOUNT_AGE_DAYS', None),
            'placeholder': 30,
            'overridden': 'BOT_HONEYPOT_MAX_ACCOUNT_AGE_DAYS' in overrides,
            'editable': True,
            'description': 'Days. Only used when "Honeypot: require young account" is on.',
        },
        {
            'label': 'Mention breaker max mentions',
            'key': 'BOT_MENTION_BREAKER_MAX_MENTIONS',
            'env': 'MENTION_BREAKER_MAX_MENTIONS',
            'value': _eff_int('BOT_MENTION_BREAKER_MAX_MENTIONS', None),
            'placeholder': 5,
            'overridden': 'BOT_MENTION_BREAKER_MAX_MENTIONS' in overrides,
            'editable': True,
            'description': 'Messages with MORE than this many unique user+role mentions trip the breaker.',
        },
        {
            'label': 'Mention breaker timeout',
            'key': 'BOT_MENTION_BREAKER_TIMEOUT_MINUTES',
            'env': 'MENTION_BREAKER_TIMEOUT_MINUTES',
            'value': _eff_int('BOT_MENTION_BREAKER_TIMEOUT_MINUTES', None),
            'placeholder': 10,
            'overridden': 'BOT_MENTION_BREAKER_TIMEOUT_MINUTES' in overrides,
            'editable': True,
            'description': 'Minutes the author is timed out for when the mention breaker trips.',
        },
    ]

    # ── Bot heartbeat ───────────────────────────────────────────────────────
    from app.db import AppSetting, db
    _hb = db.session.get(AppSetting, 'BOT_LAST_HEARTBEAT')
    bot_heartbeat_age = None
    bot_heartbeat_ts = None
    if _hb:
        try:
            _last = datetime.fromisoformat(_hb.value)
            if _last.tzinfo is None:
                _last = _last.replace(tzinfo=timezone.utc)
            bot_heartbeat_age = int((datetime.now(timezone.utc) - _last).total_seconds())
            bot_heartbeat_ts = _hb.value
        except ValueError:
            pass

    _restart_pending = 'BOT_RESTART_REQUESTED' in overrides and overrides['BOT_RESTART_REQUESTED'].value.lower() in ('true', '1', 'yes')

    # ── Wiki sync status ────────────────────────────────────────────────────
    _wiki_sync_requested = 'BOT_WIKI_SYNC_REQUESTED' in overrides and overrides['BOT_WIKI_SYNC_REQUESTED'].value.lower() in ('true', '1', 'yes')
    _wiki_status_rec = db.session.get(AppSetting, 'BOT_WIKI_SYNC_STATUS')
    _wiki_run_id_rec = db.session.get(AppSetting, 'BOT_WIKI_SYNC_RUN_ID')
    _wiki_started_rec = db.session.get(AppSetting, 'BOT_WIKI_SYNC_STARTED_AT')
    _wiki_finished_rec = db.session.get(AppSetting, 'BOT_WIKI_SYNC_FINISHED_AT')
    _wiki_error_rec = db.session.get(AppSetting, 'BOT_WIKI_SYNC_ERROR')
    _wiki_source_rec = db.session.get(AppSetting, 'BOT_WIKI_SYNC_SOURCE')
    _wiki_capable_rec = db.session.get(AppSetting, 'BOT_LIVE_WIKI_SYNC_CAPABLE')
    _wiki_capable = None if _wiki_capable_rec is None else _is_truthy(_wiki_capable_rec.value)
    _wiki_stale_after_seconds = max(
        60,
        int(get_app_setting('BOT_WIKI_SYNC_STALE_AFTER_SECONDS', cfg.get('BOT_WIKI_SYNC_STALE_AFTER_SECONDS', 3600))),
    )
    _wiki_started_at = _wiki_started_rec.value if _wiki_started_rec else None
    _wiki_started_dt = _parse_iso_utc(_wiki_started_at)
    _wiki_running_age_seconds = None
    _wiki_is_stale = False
    if _wiki_status_rec and _wiki_status_rec.value == 'running' and _wiki_started_dt:
        _wiki_running_age_seconds = int((datetime.now(timezone.utc) - _wiki_started_dt).total_seconds())
        _wiki_is_stale = _wiki_running_age_seconds >= _wiki_stale_after_seconds

    wiki_sync = {
        'requested': _wiki_sync_requested,
        'status': _wiki_status_rec.value if _wiki_status_rec else None,
        'run_id': _wiki_run_id_rec.value if _wiki_run_id_rec else None,
        'started_at': _wiki_started_at,
        'finished_at': _wiki_finished_rec.value if _wiki_finished_rec else None,
        'error': _wiki_error_rec.value if _wiki_error_rec else None,
        'source': _wiki_source_rec.value if _wiki_source_rec else None,
        'capable': _wiki_capable,
        'running_age_seconds': _wiki_running_age_seconds,
        'stale_after_seconds': _wiki_stale_after_seconds,
        'is_stale': _wiki_is_stale,
    }
    _history_rows = WikiSyncEvent.query.order_by(WikiSyncEvent.created_at.desc()).limit(120).all()
    _run_buckets: dict[str, list[WikiSyncEvent]] = {}
    for row in _history_rows:
        key = (row.run_id or '').strip() or f'legacy-{row.id}'
        _run_buckets.setdefault(key, []).append(row)

    wiki_sync_runs = []
    for run_key, rows in _run_buckets.items():
        rows_sorted = sorted(rows, key=lambda r: r.created_at or datetime.min)
        latest = rows_sorted[-1]
        started_row = next((r for r in rows_sorted if r.status == 'running'), rows_sorted[0])
        started_at = started_row.ts
        latest_at = latest.ts
        finished_at = latest.ts if latest.status in ('success', 'error') else None
        started_dt = _parse_iso_utc(started_at)
        finished_dt = _parse_iso_utc(finished_at) if finished_at else None
        duration_seconds = None
        if started_dt and finished_dt:
            duration_seconds = int((finished_dt - started_dt).total_seconds())
        err_row = next(
            (r for r in reversed(rows_sorted) if r.status == 'error' and str(r.error or '').strip()),
            None,
        )
        wiki_sync_runs.append(
            {
                'run_key': run_key,
                'run_id': (latest.run_id or '').strip(),
                'source': latest.source,
                'status': latest.status,
                'started_at': started_at,
                'finished_at': finished_at,
                'latest_at': latest_at,
                'duration_seconds': duration_seconds,
                'duration_display': _format_duration(duration_seconds),
                'error': (err_row.error if err_row else ''),
                'event_count': len(rows_sorted),
            }
        )
    wiki_sync_runs.sort(
        key=lambda row: _parse_iso_utc(row['latest_at']) or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    wiki_sync_runs = wiki_sync_runs[:12]

    retirement_jobs = (
        RetirementAutomationJob.query
        .order_by(RetirementAutomationJob.requested_at.desc())
        .limit(10)
        .all()
    )
    retirement_summary = {
        'pending_discord': RetirementAutomationJob.query.filter(
            RetirementAutomationJob.discord_completed_at.is_(None)
        ).count(),
        'pending_wiki': RetirementAutomationJob.query.filter(
            RetirementAutomationJob.discord_completed_at.is_not(None),
            RetirementAutomationJob.wiki_synced_at.is_(None),
        ).count(),
        'errored': RetirementAutomationJob.query.filter(
            RetirementAutomationJob.last_error.is_not(None),
        ).count(),
        'backoff': sum(1 for row in retirement_jobs if retirement_next_retry_at(row) is not None),
    }

    # ── Staff members (DB-managed + env baseline) ─────────────────────────
    from app.db import AppSetting as _AppSetting
    _ROLE_LABELS = {
        'administrator': 'Administrator',
        'moderator': 'Moderator',
        'storyteller': 'Storyteller',
        'system_helper': 'System Helper',
    }
    db_staff = _AppSetting.query.filter(
        _AppSetting.key.like('STAFF_MEMBER_%')
    ).order_by(_AppSetting.key).all()
    db_staff_ids = {row.key[len('STAFF_MEMBER_'):] for row in db_staff}
    db_names = {
        row.key[len('STAFF_NAME_'):]: row.value
        for row in _AppSetting.query.filter(_AppSetting.key.like('STAFF_NAME_%')).all()
    }
    _admin_ids = current_app.config.get('SETTINGS_ADMIN_DISCORD_IDS', set())
    _allowed_ids = current_app.config.get('ALLOWED_DISCORD_IDS', set())
    _env_ids = _admin_ids | _allowed_ids
    staff_members = [
        {
            'discord_id': row.key[len('STAFF_MEMBER_'):],
            'name': db_names.get(row.key[len('STAFF_MEMBER_'):], ''),
            'role': row.value,
            'label': _ROLE_LABELS.get(row.value, row.value.capitalize()),
            'source': 'db',
            # If this ID is also in env vars, removing the DB row won't revoke access.
            'has_env_access': row.key[len('STAFF_MEMBER_'):] in _env_ids,
        }
        for row in db_staff
    ]
    # Include env-var IDs not already in DB so the full access list is visible.
    for _id in sorted(_env_ids):
        if _id and _id not in db_staff_ids:
            _role = 'administrator' if _id in _admin_ids else 'staff'
            staff_members.append({
                'discord_id': _id,
                'name': db_names.get(_id, ''),
                'role': _role,
                'label': _ROLE_LABELS.get(_role, 'Staff'),
                'source': 'env',
                'has_env_access': True,
            })

    chronicle_settings = {
        'tenets': get_app_setting('CHRONICLE_TENETS', ''),
        'tenets_overridden': 'CHRONICLE_TENETS' in overrides,
    }

    return render_template(
        'settings/index.html',
        web_flags=web_flags,
        web_tuning=web_tuning,
        integrations=integrations,
        bot_flags=bot_flags,
        bot_commands=bot_commands,
        bot_channels=bot_channels,
        bot_tuning=bot_tuning,
        chronicle_settings=chronicle_settings,
        can_edit=can_edit,
        bot_heartbeat_age=bot_heartbeat_age,
        bot_heartbeat_ts=bot_heartbeat_ts,
        bot_restart_pending=_restart_pending,
        wiki_sync=wiki_sync,
        wiki_sync_runs=wiki_sync_runs,
        retirement_jobs=retirement_jobs,
        retirement_summary=retirement_summary,
        retirement_next_retry_at=retirement_next_retry_at,
        staff_members=staff_members,
    )


@bp.route('/request-wiki-sync', methods=['POST'])
@require_staff
def request_wiki_sync():
    if not is_settings_admin():
        flash('You do not have permission to run the Wiki sync.', 'danger')
        return redirect(url_for('settings.index'))

    from app.db import AppSetting, db
    wiki_capability = db.session.get(AppSetting, 'BOT_LIVE_WIKI_SYNC_CAPABLE')
    if wiki_capability is not None and not _is_truthy(wiki_capability.value):
        flash(
            'Bot reports Wiki sync prerequisites are missing (DISCORD_GUILD_ID). '
            'Update bot .env and restart the bot before running sync.',
            'danger',
        )
        return redirect(url_for('settings.index'))

    updated_by = (
        session.get('discord_name')
        or session.get('staff_user')
        or session.get('discord_id', 'unknown')
    )
    set_app_setting('BOT_WIKI_SYNC_REQUESTED', 'true', updated_by)
    flash('Wiki sync queued. The bot will start it within ~60 seconds.', 'success')
    return redirect(url_for('settings.index'))


@bp.route('/reset-wiki-sync', methods=['POST'])
@require_staff
def reset_wiki_sync():
    if not is_settings_admin():
        flash('You do not have permission to reset Wiki sync status.', 'danger')
        return redirect(url_for('settings.index'))

    from app.db import AppSetting, db
    reset_keys = (
        'BOT_WIKI_SYNC_REQUESTED',
        'BOT_WIKI_SYNC_STATUS',
        'BOT_WIKI_SYNC_RUN_ID',
        'BOT_WIKI_SYNC_STARTED_AT',
        'BOT_WIKI_SYNC_FINISHED_AT',
        'BOT_WIKI_SYNC_ERROR',
        'BOT_WIKI_SYNC_SOURCE',
    )
    deleted = 0
    for key in reset_keys:
        rec = db.session.get(AppSetting, key)
        if rec:
            db.session.delete(rec)
            deleted += 1
    if deleted:
        db.session.commit()
    flash('Wiki sync state reset. You can safely queue a fresh run.', 'success')
    return redirect(url_for('settings.index'))


@bp.route('/request-restart', methods=['POST'])
@require_staff
def request_restart():
    if not is_settings_admin():
        flash('You do not have permission to restart the bot.', 'danger')
        return redirect(url_for('settings.index'))

    updated_by = (
        session.get('discord_name')
        or session.get('staff_user')
        or session.get('discord_id', 'unknown')
    )
    set_app_setting('BOT_RESTART_REQUESTED', 'true', updated_by)
    flash('Restart requested. The bot will exit cleanly within ~60 seconds and Docker will restart it.', 'success')
    return redirect(url_for('settings.index'))


@bp.route('/request-rebuild', methods=['POST'])
@require_staff
def request_rebuild():
    if not is_settings_admin():
        flash('You do not have permission to restart the bot.', 'danger')
        return redirect(url_for('settings.index'))

    updated_by = (
        session.get('discord_name')
        or session.get('staff_user')
        or session.get('discord_id', 'unknown')
    )
    set_app_setting('BOT_RESTART_REQUESTED', 'true', updated_by)
    flash('Bot will exit within ~60s. Run the rebuild command shown below to bring it back up with the latest code.', 'info')
    return redirect(url_for('settings.index'))


@bp.route('/update', methods=['POST'])
@require_staff
def update():
    if not is_settings_admin():
        flash('You do not have permission to change settings.', 'danger')
        return redirect(url_for('settings.index'))

    key = request.form.get('key', '').strip()
    action = request.form.get('action', '').strip()  # 'set' or 'reset'

    if key not in EDITABLE_KEYS:
        flash(f'Unknown or non-editable setting: {key}', 'danger')
        return redirect(url_for('settings.index'))

    updated_by = (
        session.get('discord_name')
        or session.get('staff_user')
        or session.get('discord_id', 'unknown')
    )

    # Keys that store raw strings (no type coercion).
    _STR_KEYS = {
        'BOT_ANNOUNCEMENTS_CHANNEL_ID',
        'BOT_CC_TICKET_CATEGORY_IDS',
        'CHRONICLE_TENETS',
        'BOT_HONEYPOT_CHANNEL_ID',
        'BOT_HONEYPOT_MOD_LOG_CHANNEL_ID',
        'BOT_HONEYPOT_WHITELISTED_ROLE_IDS',
        'BOT_MENTION_BREAKER_EXEMPT_ROLE_IDS',
        'BOT_MENTION_BREAKER_MOD_LOG_CHANNEL_ID',
        'BOT_VERIFIED_MEMBER_ROLE_ID',
        'BOT_NEW_MEMBER_GATE_WELCOME_CHANNEL_ID',
        'BOT_NEW_MEMBER_GATE_SHEET_IN_PROGRESS_ROLE_ID',
        'BOT_NEW_MEMBER_GATE_LURKER_ROLE_ID',
        'BOT_NEW_NIGHT_BROADCAST_MESSAGE',
        'BOT_CORRESPONDENCE_DELIVERY_CHANNEL_ID',
        'BOT_CORRESPONDENCE_CONTACT_CHANNEL_ID',
        'BOT_CORRESPONDENCE_PRESTATION_CHANNEL_ID',
        'BOT_CORRESPONDENCE_SOCIAL_CHANNEL_ID',
        'BOT_CORRESPONDENCE_COBWEB_CHANNEL_ID',
        'BOT_CORRESPONDENCE_RUMOR_CHANNEL_ID',
    }

    # Keys that are always boolean regardless of whether they appear in app.config.
    _BOOL_KEYS = {
        'AUTO_CREATE_PERIODS_ENABLED',
        'AUTO_CLOSE_PERIODS_ENABLED',
        'BOT_API_REPLAY_PROTECTION_ENABLED',
        'BOT_REVIEW_NOTIFIER_ENABLED',
        'BOT_SUBMISSION_NOTIFIER_ENABLED',
        'BOT_AUTO_PERIOD_CREATOR_ENABLED',
        'BOT_AUTO_PERIOD_CLOSER_ENABLED',
        'BOT_CLAIM_REMINDER_ENABLED',
        'BOT_PASSAGE_OF_TIME_ENABLED',
        'BOT_HUNT_CONSEQUENCE_ENABLED',
        'BOT_RESTART_REQUESTED',
        'BOT_CC_TICKET_MONITOR_ENABLED',
        'BOT_HONEYPOT_ENABLED',
        'BOT_HONEYPOT_REQUIRE_YOUNG_ACCOUNT',
        'BOT_MENTION_BREAKER_ENABLED',
        'BOT_NEW_MEMBER_GATE_ENABLED',
        'BOT_NEW_NIGHT_BROADCAST_ENABLED',
    }

    if action == 'reset':
        delete_app_setting(key)
        flash(f'{key} reset to environment default.', 'success')
    else:
        raw_value = request.form.get('value', '').strip()
        cfg_val = current_app.config.get(key)
        if key in _STR_KEYS:
            set_app_setting(key, raw_value, updated_by)
        elif key in _BOOL_KEYS or isinstance(cfg_val, bool):
            coerced = raw_value.lower() in ('true', '1', 'yes', 'on')
            set_app_setting(key, str(coerced).lower(), updated_by)
        else:
            try:
                int(raw_value)
            except (ValueError, TypeError):
                flash(f'Invalid value for {key}: must be an integer.', 'danger')
                return redirect(url_for('settings.index'))
            set_app_setting(key, raw_value, updated_by)
        flash(f'{key} updated.', 'success')

    return redirect(url_for('settings.index'))


@bp.route('/commands/toggle', methods=['POST'])
@require_staff
def toggle_bot_command():
    if not is_settings_admin():
        flash('You do not have permission to change settings.', 'danger')
        return redirect(url_for('settings.index'))

    token = request.form.get('token', '').strip()
    action = request.form.get('action', '').strip()  # 'disable' or 'enable'

    if token not in flattened_tokens():
        flash(f'Unknown command: {token}', 'danger')
        return redirect(url_for('settings.index'))
    if action not in ('disable', 'enable'):
        flash('Invalid action.', 'danger')
        return redirect(url_for('settings.index'))

    updated_by = (
        session.get('discord_name')
        or session.get('staff_user')
        or session.get('discord_id', 'unknown')
    )

    current = {t.strip() for t in get_app_setting('BOT_DISABLED_COMMANDS', '').split(',') if t.strip()}
    if action == 'disable':
        current.add(token)
        flash(f'`{token}` disabled.', 'success')
    else:
        current.discard(token)
        flash(f'`{token}` re-enabled.', 'success')

    set_app_setting('BOT_DISABLED_COMMANDS', ','.join(sorted(current)), updated_by)
    return redirect(url_for('settings.index'))


@bp.route('/staff/add', methods=['POST'])
@require_staff
def staff_add():
    if not is_settings_admin():
        flash('Only Administrators can manage staff.', 'danger')
        return redirect(url_for('settings.index'))
    from app.db import AppSetting, db
    discord_id = request.form.get('discord_id', '').strip()
    role = request.form.get('role', '').strip()
    name = request.form.get('name', '').strip()
    if not discord_id or not discord_id.isdigit():
        flash('Invalid Discord ID — must be numeric.', 'danger')
        return redirect(url_for('settings.index'))
    if role not in ('system_helper', 'storyteller', 'moderator', 'administrator'):
        flash('Invalid role.', 'danger')
        return redirect(url_for('settings.index'))
    updated_by = session.get('discord_name', 'admin')
    key = f'STAFF_MEMBER_{discord_id}'
    row = AppSetting.query.get(key)
    if row:
        row.value = role
        row.updated_by = updated_by
    else:
        row = AppSetting(key=key, value=role, updated_by=updated_by)
        db.session.add(row)
    # Store display name if provided
    if name:
        name_key = f'STAFF_NAME_{discord_id}'
        name_row = AppSetting.query.get(name_key)
        if name_row:
            name_row.value = name
            name_row.updated_by = updated_by
        else:
            name_row = AppSetting(key=name_key, value=name, updated_by=updated_by)
            db.session.add(name_row)
    db.session.commit()
    display = f'{name} ({discord_id})' if name else discord_id
    flash(f'{role.capitalize()} {display} added.', 'success')
    return redirect(url_for('settings.index'))


@bp.route('/staff/remove', methods=['POST'])
@require_staff
def staff_remove():
    if not is_settings_admin():
        flash('Only Administrators can manage staff.', 'danger')
        return redirect(url_for('settings.index'))
    from app.db import AppSetting, db
    discord_id = request.form.get('discord_id', '').strip()
    key = f'STAFF_MEMBER_{discord_id}'
    row = AppSetting.query.get(key)
    if row:
        db.session.delete(row)
        name_row = AppSetting.query.get(f'STAFF_NAME_{discord_id}')
        if name_row:
            db.session.delete(name_row)
        db.session.commit()
        flash(f'Staff member {discord_id} removed.', 'success')
    else:
        flash('Staff member not found.', 'warning')
    return redirect(url_for('settings.index'))
