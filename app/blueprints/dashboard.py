"""Dashboard and authentication routes."""

from flask import (
    Blueprint, render_template, request, redirect, url_for, flash, session
)
from app import sheets_client, limiter
from app.auth import require_staff, check_password

bp = Blueprint('dashboard', __name__)


@bp.route('/')
@require_staff
def index():
    """Main dashboard showing XP summary for all characters."""
    dashboard_data = sheets_client.get_dashboard_data()
    pending_claims = len(sheets_client.get_pending_claims())
    pending_spends = len(sheets_client.get_pending_spends())

    return render_template(
        'dashboard.html',
        characters=dashboard_data,
        pending_claims=pending_claims,
        pending_spends=pending_spends,
    )


@bp.route('/login', methods=['GET'])
def login():
    """Show login page."""
    if session.get('authenticated'):
        return redirect(url_for('dashboard.index'))
    return render_template('login.html')


@bp.route('/login', methods=['POST'])
@limiter.limit("5 per minute")   # Brute-force protection
def login_post():
    """Process login."""
    password = request.form.get('password', '')
    staff_name = request.form.get('staff_name', '').strip()

    if not staff_name:
        flash('Please enter your name.', 'warning')
        return redirect(url_for('dashboard.login'))

    if check_password(password):
        session['authenticated'] = True
        session['staff_user'] = staff_name
        flash(f'Welcome, {staff_name}.', 'success')
        return redirect(url_for('dashboard.index'))

    flash('Invalid password.', 'danger')
    return redirect(url_for('dashboard.login'))


@bp.route('/logout')
def logout():
    """Clear session and redirect to login."""
    session.clear()
    return redirect(url_for('dashboard.login'))
