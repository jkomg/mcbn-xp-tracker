"""Dashboard and Discord OAuth authentication routes."""

import secrets
import requests
from flask import (
    Blueprint, render_template, request, redirect, url_for, flash, session,
    current_app,
)
from app import db_service, limiter
from app.auth import require_staff, is_allowed_discord_user, pop_login_next

bp = Blueprint('dashboard', __name__)

# Discord OAuth2 endpoints
DISCORD_AUTH_URL = 'https://discord.com/api/oauth2/authorize'
DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token'
DISCORD_USER_URL = 'https://discord.com/api/v10/users/@me'


@bp.route('/')
@require_staff
def index():
    """Main dashboard showing XP summary for all characters."""
    dashboard_data = db_service.get_dashboard_data()
    pending_claims = len(db_service.get_pending_claims())
    pending_spends = len(db_service.get_pending_spends())

    return render_template(
        'dashboard.html',
        characters=dashboard_data,
        pending_claims=pending_claims,
        pending_spends=pending_spends,
    )


@bp.route('/login', methods=['GET'])
def login():
    """Show login page with Discord sign-in button."""
    if session.get('authenticated'):
        return redirect(url_for('dashboard.index'))
    if session.get('discord_id'):
        # Logged in as player, not staff — send to player portal
        return redirect(url_for('player.my_characters'))
    return render_template('login.html')


@bp.route('/auth/discord')
@limiter.limit("10 per minute")
def discord_redirect():
    """Redirect user to Discord's OAuth2 authorization page."""
    # Generate a random state token to prevent CSRF
    state = secrets.token_urlsafe(32)
    session['oauth_state'] = state

    params = {
        'client_id': current_app.config['DISCORD_CLIENT_ID'],
        'redirect_uri': current_app.config['DISCORD_REDIRECT_URI'],
        'response_type': 'code',
        'scope': 'identify',
        'state': state,
    }
    # Build the redirect URL
    query = '&'.join(f'{k}={requests.utils.quote(str(v))}' for k, v in params.items())
    return redirect(f'{DISCORD_AUTH_URL}?{query}')


@bp.route('/auth/callback')
@limiter.limit("10 per minute")
def discord_callback():
    """Handle Discord OAuth2 callback."""
    # Verify state to prevent CSRF
    state = request.args.get('state')
    if not state or state != session.pop('oauth_state', None):
        flash('Invalid OAuth state. Please try again.', 'danger')
        return redirect(url_for('dashboard.login'))

    # Check for errors from Discord
    error = request.args.get('error')
    if error:
        flash(f'Discord login failed: {error}', 'danger')
        return redirect(url_for('dashboard.login'))

    code = request.args.get('code')
    if not code:
        flash('No authorization code received.', 'danger')
        return redirect(url_for('dashboard.login'))

    # Exchange authorization code for access token
    token_data = {
        'client_id': current_app.config['DISCORD_CLIENT_ID'],
        'client_secret': current_app.config['DISCORD_CLIENT_SECRET'],
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': current_app.config['DISCORD_REDIRECT_URI'],
    }
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}

    try:
        token_resp = requests.post(DISCORD_TOKEN_URL, data=token_data, headers=headers, timeout=10)
        token_resp.raise_for_status()
        access_token = token_resp.json().get('access_token')
    except Exception as exc:
        current_app.logger.error('Discord token exchange failed: %s', exc)
        flash('Failed to authenticate with Discord. Please try again.', 'danger')
        return redirect(url_for('dashboard.login'))

    if not access_token:
        flash('No access token received from Discord.', 'danger')
        return redirect(url_for('dashboard.login'))

    # Fetch Discord user info
    try:
        user_resp = requests.get(
            DISCORD_USER_URL,
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=10,
        )
        user_resp.raise_for_status()
        user_data = user_resp.json()
    except Exception:
        flash('Failed to fetch Discord user info.', 'danger')
        return redirect(url_for('dashboard.login'))

    discord_id = str(user_data.get('id', ''))
    discord_name = user_data.get('global_name') or user_data.get('username', 'Unknown')

    next_url = pop_login_next(url_for('player.my_characters'))

    # Rotate session after successful OAuth callback.
    session.clear()

    # Store Discord identity for ALL authenticated users
    session['discord_id'] = discord_id
    session['discord_name'] = discord_name
    session.permanent = True

    if is_allowed_discord_user(discord_id):
        # Staff user — full dashboard access
        session['authenticated'] = True
        session['staff_user'] = discord_name
        flash(f'Welcome, {discord_name}.', 'success')
        return redirect(next_url if next_url != url_for('player.my_characters')
                        else url_for('dashboard.index'))
    else:
        # Player user — redirect to player portal
        flash(f'Welcome, {discord_name}.', 'success')
        return redirect(next_url)


@bp.route('/logout')
def logout():
    """Clear session and redirect to login."""
    session.clear()
    return redirect(url_for('dashboard.login'))
