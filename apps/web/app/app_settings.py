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
    # Integer tuning
    'AUTO_CREATE_PERIODS_OPEN_LEAD_DAYS',
    'AUTO_CREATE_PERIODS_DEFAULT_LENGTH_DAYS',
    'AUTO_CREATE_PERIODS_DEFAULT_GAP_DAYS',
    'BOT_API_REPLAY_WINDOW_SECONDS',
    'BOT_API_NONCE_TTL_SECONDS',
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
