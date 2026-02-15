"""Simple password-based staff authentication for Phase 1.

Staff members share a single password set in .env. This will be replaced
with Discord OAuth in Phase 2.
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


def check_password(password: str) -> bool:
    """Validate the staff password against the configured value."""
    return password == current_app.config['STAFF_PASSWORD']


def get_staff_user() -> str:
    """Return the current staff user's display name from the session."""
    return session.get('staff_user', 'Unknown')
