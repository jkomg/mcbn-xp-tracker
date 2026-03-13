"""XP spend request review and approval routes."""

from flask import (
    Blueprint, render_template, request, redirect, url_for, flash, abort
)
from app import db_service, sheets_sync
from app.auth import require_staff, get_staff_user
from app.xp_rules import validate_spend_request

bp = Blueprint('spends', __name__)


@bp.route('/')
@require_staff
def pending():
    """List all pending spend requests."""
    spends = db_service.get_pending_spends()
    return render_template('spends/pending.html', spends=spends)


@bp.route('/<int:row_id>')
@require_staff
def review(row_id):
    """Review a single spend request with cost validation."""
    spend = db_service.get_spend_by_row(row_id)
    if not spend:
        abort(404)

    # Validate the spend against V5 XP rules
    validation = validate_spend_request(
        category=spend.spend_category,
        current_dots=spend.current_dots,
        new_dots=spend.new_dots,
        player_cost=spend.xp_cost,
    )

    # Get character's available XP for context
    dashboard_data = db_service.get_dashboard_data()
    char_data = next(
        (c for c in dashboard_data
         if c['character_name'].lower() == spend.character_name.lower()),
        None,
    )
    available_xp = char_data['available_xp'] if char_data else 0

    return render_template(
        'spends/review.html',
        spend=spend,
        validation=validation,
        available_xp=available_xp,
    )


@bp.route('/<int:row_id>/approve', methods=['POST'])
@require_staff
def approve(row_id):
    """Approve a spend request."""
    spend = db_service.get_spend_by_row(row_id)
    if not spend:
        abort(404)

    if spend.status.lower() == 'approved':
        flash('This spend request has already been approved.', 'warning')
        return redirect(url_for('spends.pending'))

    try:
        verified_cost = int(request.form.get('verified_cost', 0))
    except (TypeError, ValueError):
        flash('Verified cost must be a whole number.', 'danger')
        return redirect(url_for('spends.review', row_id=row_id))
    if verified_cost < 0 or verified_cost > 200:
        flash('Verified cost must be between 0 and 200.', 'danger')
        return redirect(url_for('spends.review', row_id=row_id))
    notes = request.form.get('notes', '')
    staff = get_staff_user()

    db_service.approve_spend(row_id, verified_cost, staff, notes)
    db_service.log_action(
        staff_user=staff,
        action_type='approve_spend',
        target=spend.character_name,
        details=(
            f'Approved spend: {spend.trait_name} '
            f'({spend.current_dots}→{spend.new_dots}) '
            f'for {verified_cost} XP. {notes}'
        ).strip(),
    )
    if sheets_sync:
        sheets_sync.sync_approve_spend(
            character_name=spend.character_name,
            trait_name=spend.trait_name,
            spend_category=spend.spend_category,
            current_dots=spend.current_dots,
            new_dots=spend.new_dots,
            verified_cost=verified_cost,
            reviewer=staff,
            notes=notes,
        )
        sheets_sync.sync_log_action(
            staff_user=staff,
            action_type='approve_spend',
            target=spend.character_name,
            details=(
                f'Approved spend: {spend.trait_name} '
                f'({spend.current_dots}→{spend.new_dots}) '
                f'for {verified_cost} XP. {notes}'
            ).strip(),
        )

    flash(
        f'Approved {spend.trait_name} spend for {spend.character_name} '
        f'({verified_cost} XP).',
        'success',
    )
    return redirect(url_for('spends.pending'))


@bp.route('/<int:row_id>/deny', methods=['POST'])
@require_staff
def deny(row_id):
    """Deny a spend request."""
    spend = db_service.get_spend_by_row(row_id)
    if not spend:
        abort(404)

    if spend.status.lower() == 'denied':
        flash('This spend request has already been denied.', 'warning')
        return redirect(url_for('spends.pending'))

    notes = request.form.get('notes', '')
    staff = get_staff_user()

    db_service.deny_spend(row_id, staff, notes)
    db_service.log_action(
        staff_user=staff,
        action_type='deny_spend',
        target=spend.character_name,
        details=(
            f'Denied spend: {spend.trait_name} '
            f'({spend.current_dots}→{spend.new_dots}). {notes}'
        ).strip(),
    )
    if sheets_sync:
        sheets_sync.sync_deny_spend(
            character_name=spend.character_name,
            trait_name=spend.trait_name,
            spend_category=spend.spend_category,
            current_dots=spend.current_dots,
            new_dots=spend.new_dots,
            reviewer=staff,
            notes=notes,
        )
        sheets_sync.sync_log_action(
            staff_user=staff,
            action_type='deny_spend',
            target=spend.character_name,
            details=(
                f'Denied spend: {spend.trait_name} '
                f'({spend.current_dots}→{spend.new_dots}). {notes}'
            ).strip(),
        )

    flash(f'Denied spend for {spend.character_name}.', 'warning')
    return redirect(url_for('spends.pending'))


@bp.route('/history')
@require_staff
def history():
    """View all spend requests (approved, denied, pending)."""
    all_spends = db_service.get_all_spends()
    return render_template('spends/history.html', spends=all_spends)
