"""Authentication via Discord OAuth2.

Two-tier auth system:
- Staff: Discord users whose IDs are in the ALLOWED_DISCORD_IDS config
- Players: Any authenticated Discord user (access limited to own characters)
"""

from functools import wraps
from flask import session, redirect, url_for, flash, current_app, request, abort


def require_staff(f):
    """Decorator to protect routes that require staff authentication."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('authenticated'):
            flash('Please log in to access this page.', 'warning')
            return redirect(url_for('dashboard.login'))
        return f(*args, **kwargs)
    return decorated_function


def require_login(f):
    """Decorator requiring any Discord authentication (staff or player).

    Checks for session['discord_id']. If absent, redirects to the
    unified login page. Stores the requested URL for post-login redirect.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('discord_id'):
            flash('Please sign in with Discord to continue.', 'warning')
            session['login_next'] = request.url
            return redirect(url_for('dashboard.login'))
        return f(*args, **kwargs)
    return decorated_function


def require_character_owner(f):
    """Decorator for player routes that operate on a specific character.

    Requires login. If the user is staff, grants access to any character.
    If the user is a player, checks that the character's player_discord
    matches their session discord_id. Returns 404 if no match.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('discord_id'):
            flash('Please sign in with Discord to continue.', 'warning')
            session['login_next'] = request.url
            return redirect(url_for('dashboard.login'))

        # Staff bypass — they can access any character
        if is_allowed_discord_user(session['discord_id']):
            return f(*args, **kwargs)

        # Player access — verify character ownership
        name = kwargs.get('name')
        if name:
            from app import sheets_client
            char = sheets_client.get_character(name)
            if not char or char.player_discord != session['discord_id']:
                abort(404)

        return f(*args, **kwargs)
    return decorated_function


def is_allowed_discord_user(discord_id: str) -> bool:
    """Check whether a Discord user ID is in the staff allowlist."""
    return str(discord_id) in current_app.config['ALLOWED_DISCORD_IDS']


def is_staff() -> bool:
    """Check if the current session user is staff."""
    discord_id = session.get('discord_id', '')
    return bool(discord_id) and is_allowed_discord_user(discord_id)


def is_logged_in() -> bool:
    """Check if the current session has any Discord authentication."""
    return bool(session.get('discord_id'))


def get_player_discord_id() -> str:
    """Return the current user's numeric Discord ID from session."""
    return session.get('discord_id', '')


def get_staff_user() -> str:
    """Return the current staff user's display name from the session."""
    return session.get('staff_user', 'Unknown')
