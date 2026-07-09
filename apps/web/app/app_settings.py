"""Runtime-editable app settings stored in the DB.

DB overrides take priority over env-var config values.
Falls back to current_app.config (and then the supplied default) when
no DB record exists for a key.
"""

from datetime import datetime

from flask import current_app

from .db import AppSetting, db

# Keys that can be updated at runtime via the settings UI.
EDITABLE_KEYS = {
    # Boolean flags
    'AUTO_CREATE_PERIODS_ENABLED',
    'AUTO_CLOSE_PERIODS_ENABLED',
    'BOT_API_REPLAY_PROTECTION_ENABLED',
    # Bot feature flags (polled by bot via /api/bot-config)
    'BOT_REVIEW_NOTIFIER_ENABLED',
    'BOT_SUBMISSION_NOTIFIER_ENABLED',
    'BOT_AUTO_PERIOD_CREATOR_ENABLED',
    'BOT_AUTO_PERIOD_CLOSER_ENABLED',
    'BOT_CLAIM_REMINDER_ENABLED',
    'BOT_PASSAGE_OF_TIME_ENABLED',
    'BOT_HUNT_CONSEQUENCE_ENABLED',
    'BOT_HONEYPOT_ENABLED',
    'BOT_HONEYPOT_REQUIRE_YOUNG_ACCOUNT',
    'BOT_MENTION_BREAKER_ENABLED',
    'BOT_NEW_MEMBER_GATE_ENABLED',
    # Bot restart / sync signals
    'BOT_RESTART_REQUESTED',
    'BOT_WIKI_SYNC_REQUESTED',
    # Per-command/subcommand kill switches (polled by bot via /api/bot-config)
    'BOT_DISABLED_COMMANDS',
    # CC ticket monitor (polled by bot via /api/bot-config; applies within 1 minute)
    'BOT_CC_TICKET_MONITOR_ENABLED',
    'BOT_CC_TICKET_CATEGORY_IDS',
    # Bot channel IDs (polled by bot via /api/bot-config; take effect after restart)
    'BOT_ANNOUNCEMENTS_CHANNEL_ID',
    'BOT_HONEYPOT_CHANNEL_ID',
    'BOT_HONEYPOT_MOD_LOG_CHANNEL_ID',
    'BOT_HONEYPOT_WHITELISTED_ROLE_IDS',
    'BOT_MENTION_BREAKER_EXEMPT_ROLE_IDS',
    'BOT_MENTION_BREAKER_MOD_LOG_CHANNEL_ID',
    'BOT_VERIFIED_MEMBER_ROLE_ID',
    'BOT_NEW_MEMBER_GATE_WELCOME_CHANNEL_ID',
    'BOT_NEW_MEMBER_GATE_SHEET_IN_PROGRESS_ROLE_ID',
    'BOT_NEW_MEMBER_GATE_LURKER_ROLE_ID',
    # Correspondence command channel IDs (polled by bot via /api/bot-config; no restart needed)
    'BOT_CORRESPONDENCE_DELIVERY_CHANNEL_ID',
    'BOT_CORRESPONDENCE_CONTACT_CHANNEL_ID',
    'BOT_CORRESPONDENCE_PRESTATION_CHANNEL_ID',
    'BOT_CORRESPONDENCE_SOCIAL_CHANNEL_ID',
    'BOT_CORRESPONDENCE_COBWEB_CHANNEL_ID',
    'BOT_CORRESPONDENCE_RUMOR_CHANNEL_ID',
    # Bot tuning (polled by bot via /api/bot-config; take effect after restart)
    'BOT_PASSAGE_OF_TIME_INTERVAL_MS',
    'BOT_REVIEW_NOTIFIER_INTERVAL_MS',
    'BOT_SUBMISSION_NOTIFIER_INTERVAL_MS',
    'BOT_CLAIM_REMINDER_INTERVAL_MS',
    'BOT_HONEYPOT_MAX_ACCOUNT_AGE_DAYS',
    'BOT_MENTION_BREAKER_MAX_MENTIONS',
    'BOT_MENTION_BREAKER_TIMEOUT_MINUTES',
    # Chronicle settings
    'CHRONICLE_TENETS',
    # Integer tuning
    'AUTO_CREATE_PERIODS_OPEN_LEAD_DAYS',
    'AUTO_CREATE_PERIODS_DEFAULT_LENGTH_DAYS',
    'AUTO_CREATE_PERIODS_DEFAULT_GAP_DAYS',
    'BOT_API_REPLAY_WINDOW_SECONDS',
    'BOT_API_NONCE_TTL_SECONDS',
    'BOT_WIKI_SYNC_STALE_AFTER_SECONDS',
    'SHEETS_CACHE_TTL',
}


def get_app_setting(key: str, default=None):
    """Return the effective value for *key*.

    Checks the DB override table first; falls back to current_app.config,
    then *default*.  Coerces the stored string to match the type of *default*
    (bool → bool, int → int, float → float).
    """
    try:
        record = db.session.get(AppSetting, key)
        if record is not None:
            raw = record.value
            if isinstance(default, bool):
                return raw.lower() in ('true', '1', 'yes')
            if isinstance(default, int):
                return int(raw)
            if isinstance(default, float):
                return float(raw)
            return raw
    except Exception:
        pass
    return current_app.config.get(key, default)


def set_app_setting(key: str, value, updated_by: str) -> None:
    """Persist a runtime override for *key*."""
    if key not in EDITABLE_KEYS:
        raise ValueError(f'Key {key!r} is not editable')
    record = db.session.get(AppSetting, key)
    if record is None:
        record = AppSetting(
            key=key,
            value=str(value),
            updated_by=updated_by,
            updated_at=datetime.utcnow(),
        )
        db.session.add(record)
    else:
        record.value = str(value)
        record.updated_by = updated_by
        record.updated_at = datetime.utcnow()
    db.session.commit()

    # Side-effect: update live SheetsClient cache TTL without a restart.
    if key == 'SHEETS_CACHE_TTL':
        try:
            from app import sheets_client  # noqa: PLC0415
            if sheets_client is not None:
                sheets_client._cache.ttl = int(value)
        except Exception:
            pass


def delete_app_setting(key: str) -> None:
    """Remove a DB override, reverting the key to its env-var default."""
    if key not in EDITABLE_KEYS:
        raise ValueError(f'Key {key!r} is not editable')
    record = db.session.get(AppSetting, key)
    if record:
        db.session.delete(record)
        db.session.commit()


def get_all_overrides() -> dict[str, 'AppSetting']:
    """Return a dict of key → AppSetting for all currently stored overrides."""
    return {r.key: r for r in AppSetting.query.all()}
