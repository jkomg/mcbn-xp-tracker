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

bp = Blueprint('settings', __name__)


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
    }
    from app.db import AppSetting
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
    ]

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
            'overridden': 'BOT_ANNOUNCEMENTS_CHANNEL_ID' in overrides,
            'editable': True,
            'description': 'Channel ID for /lasombra broadcast → announcements target.',
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

    # ── Staff members (DB-managed) ─────────────────────────────────────────
    from app.db import AppSetting as _AppSetting
    db_staff = _AppSetting.query.filter(
        _AppSetting.key.like('STAFF_MEMBER_%')
    ).order_by(_AppSetting.key).all()
    staff_members = [
        {
            'discord_id': row.key[len('STAFF_MEMBER_'):],
            'role': row.value,
            'label': 'Administrator' if row.value == 'administrator' else 'Storyteller',
        }
        for row in db_staff
    ]

    return render_template(
        'settings/index.html',
        web_flags=web_flags,
        web_tuning=web_tuning,
        integrations=integrations,
        bot_flags=bot_flags,
        bot_channels=bot_channels,
        bot_tuning=bot_tuning,
        can_edit=can_edit,
        bot_heartbeat_age=bot_heartbeat_age,
        bot_heartbeat_ts=bot_heartbeat_ts,
        bot_restart_pending=_restart_pending,
        staff_members=staff_members,
    )


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


@bp.route('/staff/add', methods=['POST'])
@require_staff
def staff_add():
    if not is_settings_admin():
        flash('Only Administrators can manage staff.', 'danger')
        return redirect(url_for('settings.index'))
    from app.db import AppSetting, db
    discord_id = request.form.get('discord_id', '').strip()
    role = request.form.get('role', '').strip()
    if not discord_id or not discord_id.isdigit():
        flash('Invalid Discord ID — must be numeric.', 'danger')
        return redirect(url_for('settings.index'))
    if role not in ('storyteller', 'administrator'):
        flash('Invalid role.', 'danger')
        return redirect(url_for('settings.index'))
    key = f'STAFF_MEMBER_{discord_id}'
    row = AppSetting.query.get(key)
    if row:
        row.value = role
        row.updated_by = session.get('discord_name', 'admin')
    else:
        row = AppSetting(key=key, value=role, updated_by=session.get('discord_name', 'admin'))
        db.session.add(row)
    db.session.commit()
    flash(f'{role.capitalize()} {discord_id} added.', 'success')
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
        db.session.commit()
        flash(f'Staff member {discord_id} removed.', 'success')
    else:
        flash('Staff member not found.', 'warning')
    return redirect(url_for('settings.index'))
