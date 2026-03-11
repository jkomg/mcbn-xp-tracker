"""XP claim review and approval routes."""

from flask import (
    Blueprint, render_template, request, redirect, url_for, flash, abort
)
from app import sheets_client
from app.auth import require_staff, get_staff_user

bp = Blueprint('claims', __name__)


@bp.route('/')
@require_staff
def pending():
    """List all pending XP claims."""
    claims = sheets_client.get_pending_claims()
    return render_template('claims/pending.html', claims=claims)


@bp.route('/<int:row_id>')
@require_staff
def review(row_id):
    """Review a single XP claim."""
    claim = sheets_client.get_claim_by_row(row_id)
    if not claim:
        abort(404)
    return render_template('claims/review.html', claim=claim)


@bp.route('/<int:row_id>/approve', methods=['POST'])
@require_staff
def approve(row_id):
    """Approve an XP claim."""
    claim = sheets_client.get_claim_by_row(row_id)
    if not claim:
        abort(404)

    # Guard: prevent double-approve
    if claim.status.strip().lower() == 'approved':
        flash(f'Claim for {claim.character_name} ({claim.play_period}) '
              f'is already approved.', 'warning')
        return redirect(url_for('claims.pending'))

    try:
        approved_xp = int(request.form.get('approved_xp', 0))
    except (TypeError, ValueError):
        flash('Approved XP must be a whole number.', 'danger')
        return redirect(url_for('claims.review', row_id=row_id))
    if approved_xp < 0 or approved_xp > 50:
        flash('Approved XP must be between 0 and 50.', 'danger')
        return redirect(url_for('claims.review', row_id=row_id))
    notes = request.form.get('notes', '')
    staff = get_staff_user()

    sheets_client.approve_claim(row_id, approved_xp, staff, notes)

    # Write approved XP to the ledger so it's permanently recorded
    if approved_xp > 0:
        from datetime import date as _date
        sheets_client.add_ledger_entry(
            character_name=claim.character_name,
            date=_date.today().strftime('%Y%m%d'),
            awarded=approved_xp,
            spent=0,
            reason=f'{claim.play_period} (claim approved)',
            staff_user=staff,
        )

    sheets_client.log_action(
        staff_user=staff,
        action_type='approve_claim',
        target=claim.character_name,
        details=f'Approved {approved_xp} XP for {claim.play_period}. {notes}'.strip(),
    )

    flash(f'Approved {approved_xp} XP for {claim.character_name}.', 'success')
    return redirect(url_for('claims.pending'))


@bp.route('/<int:row_id>/deny', methods=['POST'])
@require_staff
def deny(row_id):
    """Deny an XP claim."""
    claim = sheets_client.get_claim_by_row(row_id)
    if not claim:
        abort(404)

    # Guard: prevent double-deny
    if claim.status.strip().lower() == 'denied':
        flash(f'Claim for {claim.character_name} ({claim.play_period}) '
              f'is already denied.', 'warning')
        return redirect(url_for('claims.pending'))

    notes = request.form.get('notes', '')
    staff = get_staff_user()

    sheets_client.deny_claim(row_id, staff, notes)
    sheets_client.log_action(
        staff_user=staff,
        action_type='deny_claim',
        target=claim.character_name,
        details=f'Denied claim for {claim.play_period}. {notes}'.strip(),
    )

    flash(f'Denied claim for {claim.character_name}.', 'warning')
    return redirect(url_for('claims.pending'))


@bp.route('/history')
@require_staff
def history():
    """View all claims (approved, denied, pending)."""
    all_claims = sheets_client.get_all_claims()
    return render_template('claims/history.html', claims=all_claims)
