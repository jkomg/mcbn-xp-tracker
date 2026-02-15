"""Staff authentication via Discord OAuth2.

Only Discord users whose IDs are in the ALLOWED_DISCORD_IDS config
are granted staff access.
"""

from functools import wraps
from flask import session, redirect, url_for, flash, current_app


def require_staff(f):
    """Decorator to protect routes that require staff authentication."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('authenticated'):
            flash('Please log in to access this page.', 'warning')
            return redirect(url_for('dashboard.login'))
        return f(*args, **kwargs)
    return decorated_function


def is_allowed_discord_user(discord_id: str) -> bool:
    """Check whether a Discord user ID is in the staff allowlist."""
    return str(discord_id) in current_app.config['ALLOWED_DISCORD_IDS']


def get_staff_user() -> str:
    """Return the current staff user's display name from the session."""
    return session.get('staff_user', 'Unknown')
