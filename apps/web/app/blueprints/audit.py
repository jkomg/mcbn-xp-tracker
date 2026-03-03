"""Audit log viewing routes."""

from flask import Blueprint, render_template, request
from app import sheets_client
from app.auth import require_staff

bp = Blueprint('audit', __name__)


@bp.route('/')
@require_staff
def log():
    """View the audit log with optional filters."""
    action_filter = request.args.get('action', '')
    character_filter = request.args.get('character', '')
    staff_filter = request.args.get('staff', '')

    all_entries = sheets_client.get_audit_log(limit=500)
    entries = list(all_entries)

    if action_filter:
        entries = [e for e in entries
                   if e.action_type == action_filter]
    if character_filter:
        entries = [e for e in entries
                   if character_filter.lower() in e.target_character.lower()]
    if staff_filter:
        entries = [e for e in entries
                   if staff_filter.lower() in e.staff_user.lower()]

    # Collect unique values for filter dropdowns
    action_types = sorted(set(e.action_type for e in all_entries
                              if e.action_type))
    staff_users = sorted(set(e.staff_user for e in all_entries
                             if e.staff_user))

    return render_template(
        'audit/log.html',
        entries=entries,
        action_filter=action_filter,
        character_filter=character_filter,
        staff_filter=staff_filter,
        action_types=action_types,
        staff_users=staff_users,
    )
