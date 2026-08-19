"""Who may create a character, and in which rollout stage.

Character creation ships dark: the wizard, its API and the ST review side all
exist in production before players are meant to touch them.  This module is the
single gate that decides whether a request is allowed to *create*, and it is
deliberately the only place that answer is computed — the entry-point button in
the player dashboard and the endpoints behind it must never disagree, or the
button disappears while the URL still works.

Two runtime settings drive it, both editable from Settings without a redeploy:

    CHARACTER_CREATION_MODE               off | staff | everyone
    CHARACTER_CREATION_PILOT_DISCORD_IDS  comma-separated Discord IDs

`off` is a true stop: nobody creates characters, staff and pilots included, so
it works as an emergency switch if something turns up mid-rollout.  `staff`
opens the flow to staff plus anyone named in the pilot list, which is the stage
for testing on production and then handing it to a few trusted players.
`everyone` is launch.

Reviewing and editing what already exists is *not* gated here.  Drafts already
submitted still need STs to work on them, and an approved character's sheet is
long-since live, so those paths stay open whatever the mode.
"""

from __future__ import annotations

from functools import wraps

from flask import flash, jsonify, redirect, session, url_for

from .app_settings import get_app_setting
from .auth import is_staff

MODE_OFF = 'off'
MODE_STAFF = 'staff'
MODE_EVERYONE = 'everyone'
CHARACTER_CREATION_MODES = (MODE_OFF, MODE_STAFF, MODE_EVERYONE)


def character_creation_mode() -> str:
    """Return the effective rollout mode, defaulting to off.

    An unrecognised value reads as off rather than raising: a typo in the
    settings field should close the gate, not open it or break the page.
    """
    raw = str(get_app_setting('CHARACTER_CREATION_MODE', MODE_OFF) or '').strip().lower()
    return raw if raw in CHARACTER_CREATION_MODES else MODE_OFF


def pilot_discord_ids() -> set[str]:
    """Discord IDs allowed to create while the mode is still `staff`."""
    raw = str(get_app_setting('CHARACTER_CREATION_PILOT_DISCORD_IDS', '') or '')
    return {part.strip() for part in raw.replace('\n', ',').split(',') if part.strip()}


def can_create_characters(discord_id: str | None = None) -> bool:
    """Whether this user may start, edit or submit a character draft.

    Falls back to the session's Discord id, so templates and endpoints can call
    it with no arguments and get the same answer.
    """
    mode = character_creation_mode()
    if mode == MODE_OFF:
        return False
    if mode == MODE_EVERYONE:
        return True

    # staff mode: staff, plus the named pilot players.
    if is_staff():
        return True
    resolved = discord_id if discord_id is not None else session.get('discord_id', '')
    return bool(resolved) and str(resolved) in pilot_discord_ids()


def require_character_creation(view):
    """Guard a JSON creation endpoint, returning 403 when the gate is closed."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not can_create_characters():
            return jsonify({
                'error': 'Character creation is not open yet.',
                'code': 'character_creation_disabled',
            }), 403
        return view(*args, **kwargs)
    return wrapped


def require_character_creation_or_staff(view):
    """Guard a draft-editing endpoint that STs also use for review work.

    The ST draft editor loads the same SPA as the player wizard and saves
    through the same endpoint, so gating it outright would strand drafts
    already in the review queue whenever the mode is closed.
    """
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not is_staff() and not can_create_characters():
            return jsonify({
                'error': 'Character creation is not open yet.',
                'code': 'character_creation_disabled',
            }), 403
        return view(*args, **kwargs)
    return wrapped


def require_character_creation_page(view):
    """Guard an HTML creation route, bouncing to the dashboard with a notice."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not can_create_characters():
            flash('Character creation is not open yet.', 'warning')
            return redirect(url_for('player.my_characters'))
        return view(*args, **kwargs)
    return wrapped
