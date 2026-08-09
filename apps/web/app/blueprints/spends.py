"""XP spend request review and approval routes."""

from datetime import datetime, timezone

from flask import (
    Blueprint, render_template, request, redirect, url_for, flash, abort
)
from app import db_service, sheets_sync
from app.auth import require_staff, get_staff_user
from app.xp_rules import validate_spend_request
from app.character_sheet import (
    patch_character_draft, find_trait_sheet_match, subcategory_label_for_trait,
    character_has_specialty, advantage_sheet_level,
)

bp = Blueprint('spends', __name__)


def _days_waiting(timestamp: str) -> int:
    """Days since a spend was submitted, from the 'YYYYMMDD HH:MM:SS' UTC timestamp
    written by db_service._now_str()."""
    try:
        submitted = datetime.strptime(timestamp, '%Y%m%d %H:%M:%S').replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return 0
    return max(0, (datetime.now(timezone.utc) - submitted).days)


@bp.route('/')
@require_staff
def pending():
    """List all pending spend requests, enriched for the expandable-queue view."""
    spends = db_service.get_pending_spends()
    dashboard_data = {c['character_name'].lower(): c for c in db_service.get_dashboard_data()}
    by_row = {s.row_index: s for s in spends}

    rows = []
    for spend in spends:
        validation = validate_spend_request(
            category=spend.spend_category,
            current_dots=spend.current_dots,
            new_dots=spend.new_dots,
            player_cost=spend.xp_cost,
        )
        char_data = dashboard_data.get(spend.character_name.lower())
        depends_on_spend = by_row.get(spend.depends_on) if spend.depends_on else None
        sheet_match = find_trait_sheet_match(
            spend.character_name, spend.spend_category, spend.trait_name, spend.power_name,
        )
        days = _days_waiting(spend.timestamp)
        rows.append({
            'spend': spend,
            'validation': validation,
            'available_xp': char_data['available_xp'] if char_data else 0,
            'depends_on_spend': depends_on_spend,
            'sheet_match': sheet_match,
            'days': days,
            # Distinguishes a Discipline power_name (e.g. "Auspex 3") from a
            # structured Advantage sub-category value (e.g. "Tremere") stored
            # in the same power_name field — see _SUBCATEGORY_ADVANTAGES.
            'power_name_label': subcategory_label_for_trait(spend.trait_name, spend.spend_category),
        })

    # Oldest-first, matching the design's "sorted oldest-first" note.
    rows.sort(key=lambda r: r['days'], reverse=True)
    return render_template('spends/pending.html', rows=rows, pending_count=len(rows))


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

    # Dependency chain context
    depends_on_spend = db_service.get_spend_by_row(spend.depends_on) if spend.depends_on else None
    dependents = db_service.get_spend_dependents(spend.row_index)

    # Warn staff if the trait name doesn't exactly match an existing sheet
    # entry — e.g. "Status" submitted when the sheet has "Status (Tremere)" —
    # since approving as-is creates a stray duplicate instead of raising it.
    sheet_match = find_trait_sheet_match(
        spend.character_name, spend.spend_category, spend.trait_name, spend.power_name,
    )

    # Distinguishes a Discipline power_name (e.g. "Auspex 3") from a
    # structured Advantage sub-category value (e.g. "Tremere") stored in the
    # same power_name field — see _SUBCATEGORY_ADVANTAGES.
    power_name_label = subcategory_label_for_trait(spend.trait_name, spend.spend_category)

    return render_template(
        'spends/review.html',
        spend=spend,
        validation=validation,
        available_xp=available_xp,
        depends_on_spend=depends_on_spend,
        dependents=dependents,
        sheet_match=sheet_match,
        power_name_label=power_name_label,
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

    # Staff can correct the trait name at approval time — e.g. resolving a
    # "close match" warning (submitted as "Retainer" when the sheet already
    # has "Retainer (Mortal Steve)") without needing to hand-edit the
    # character's JSON afterward. Applied immediately so every downstream
    # check/log/sync below (duplicate-specialty check, patch, audit log,
    # Sheets mirror, flash message) sees the corrected name consistently.
    original_trait_name = spend.trait_name
    corrected_trait_name = request.form.get('trait_name', '').strip()[:100]
    if corrected_trait_name and corrected_trait_name != spend.trait_name:
        # The corrected name must refer to a trait currently at
        # spend.current_dots — otherwise this spend's submitted dot range
        # (and the XP cost derived from it) no longer describes the entry
        # being patched. e.g. selecting a level-3 "Retainer (Bob)" for a
        # submitted 1→2 spend would charge for 1→2 while patch_character_draft
        # unconditionally sets that entry to new_dots, silently lowering it.
        # Looked up the same way _apply_patch itself resolves the name
        # (case-insensitive, against both backgrounds and merits) — not
        # find_trait_sheet_match's close_matches, which is prefix-filtered
        # against the *original* submitted name and can miss a casing
        # variant or an entry outside that prefix that the patch would still
        # find and silently overwrite.
        matched_level = (
            advantage_sheet_level(spend.character_name, corrected_trait_name)
            if spend.spend_category == 'Advantage (Merit/Background)'
            else None
        )
        if matched_level is not None and matched_level != spend.current_dots:
            flash(
                f'Cannot approve — "{corrected_trait_name}" is currently at '
                f'{matched_level} dots on the sheet, not '
                f'{spend.current_dots}. Correct the submitted dot range or '
                'choose the right match.',
                'danger',
            )
            return redirect(url_for('spends.review', row_id=row_id))
        spend.trait_name = corrected_trait_name
    else:
        corrected_trait_name = None  # signal to approve_spend: no rename needed

    # Same queue-order and cost-validity guards bulk_approve() already
    # enforces — the single-spend path (both the classic review page and
    # the inline pending-queue expand panel) posted straight through
    # without them, letting staff jump a dependency queue or approve a
    # structurally invalid spend (e.g. unrecognized category) at a
    # nonsensical system-computed cost of 0 XP.
    if spend.depends_on:
        parent = db_service.get_spend_by_row(spend.depends_on)
        if not parent or parent.status.lower() != 'approved':
            flash(
                f'{spend.character_name} / {spend.trait_name} depends on another '
                'spend request that has not been approved yet.',
                'danger',
            )
            return redirect(url_for('spends.review', row_id=row_id))

    validation = validate_spend_request(
        category=spend.spend_category,
        current_dots=spend.current_dots,
        new_dots=spend.new_dots,
        player_cost=spend.xp_cost,
    )
    if not validation.get('valid', False):
        flash(
            f'Cannot approve — {validation.get("message") or "this spend failed cost validation"}.',
            'danger',
        )
        return redirect(url_for('spends.review', row_id=row_id))

    try:
        verified_cost = int(request.form.get('verified_cost', 0))
    except (TypeError, ValueError):
        flash('Verified cost must be a whole number.', 'danger')
        return redirect(url_for('spends.review', row_id=row_id))
    if verified_cost < 0 or verified_cost > 200:
        flash('Verified cost must be between 0 and 200.', 'danger')
        return redirect(url_for('spends.review', row_id=row_id))

    available_xp = db_service.get_xp_totals(spend.character_name)['available_xp']
    if verified_cost > available_xp:
        flash(
            f'Cannot approve — insufficient XP. {spend.character_name} has '
            f'{available_xp} XP available, this costs {verified_cost} XP.',
            'danger',
        )
        return redirect(url_for('spends.review', row_id=row_id))

    # Two identical Skill Specialty requests can both pass submit_spend's
    # duplicate check if submitted before either is approved (neither sheet
    # has the specialty yet). Re-check live, right before charging, so the
    # second approval is rejected instead of silently charging XP for a
    # patch that will no-op (character_sheet.py's staleness/duplicate guard).
    if (
        spend.spend_category == 'Skill Specialty'
        and character_has_specialty(spend.character_name, spend.trait_name, spend.power_name)
    ):
        flash(
            f'Cannot approve — {spend.character_name} already has a '
            f'"{spend.power_name}" specialty in {spend.trait_name}. '
            'This looks like a duplicate of an already-approved request.',
            'danger',
        )
        return redirect(url_for('spends.review', row_id=row_id))

    notes = request.form.get('notes', '')[:1000]
    staff = get_staff_user()

    db_service.approve_spend(row_id, verified_cost, staff, notes, trait_name=corrected_trait_name)
    patch_character_draft(spend)
    rename_note = f' (renamed from "{original_trait_name}" to resolve a close-match warning)' if corrected_trait_name else ''
    db_service.log_action(
        staff_user=staff,
        action_type='approve_spend',
        target=spend.character_name,
        details=(
            f'Approved spend: {spend.trait_name}{rename_note} '
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
            original_trait_name=original_trait_name,
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

    notes = request.form.get('notes', '')[:1000]
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


@bp.route('/<int:row_id>/reverse', methods=['POST'])
@require_staff
def reverse(row_id):
    """Reverse an approved spend request back to Pending, restoring its XP."""
    spend = db_service.get_spend_by_row(row_id)
    if not spend:
        abort(404)

    notes = request.form.get('notes', '')[:1000]
    staff = get_staff_user()

    try:
        result = db_service.reverse_spend(row_id, staff, notes)
    except ValueError as e:
        flash(str(e), 'danger')
        return redirect(url_for('spends.history'))

    db_service.log_action(
        staff_user=staff,
        action_type='reverse_spend',
        target=spend.character_name,
        details=(
            f'Reversed spend: {spend.trait_name} '
            f'({spend.current_dots}→{spend.new_dots}), restoring {spend.verified_cost} XP. '
            f'Originally approved by {spend.reviewed_by or "unknown"}. {notes}'
        ).strip(),
    )
    if sheets_sync:
        sheets_sync.sync_reverse_spend(
            character_name=spend.character_name,
            trait_name=spend.trait_name,
            spend_category=spend.spend_category,
            current_dots=spend.current_dots,
            new_dots=spend.new_dots,
            notes=notes,
        )
        sheets_sync.sync_log_action(
            staff_user=staff,
            action_type='reverse_spend',
            target=spend.character_name,
            details=(
                f'Reversed spend: {spend.trait_name} '
                f'({spend.current_dots}→{spend.new_dots}), restoring {spend.verified_cost} XP. '
                f'Originally approved by {spend.reviewed_by or "unknown"}. {notes}'
            ).strip(),
        )

    if result['sheet_reverted']:
        flash(
            f'Reversed {spend.trait_name} spend for {spend.character_name} — '
            f'XP restored, character sheet rolled back, and it is back in the pending queue.',
            'success',
        )
    else:
        flash(
            f'Reversed {spend.trait_name} spend for {spend.character_name} — XP restored '
            f'and it is back in the pending queue, but the character sheet could not be '
            f'safely rolled back automatically (it may have changed since). Please check '
            f'{spend.character_name}\'s sheet manually.',
            'warning',
        )
    if spend.coterie_id:
        flash(
            f'This spend was a coterie XP donation to {spend.coterie_name or "a coterie"} — '
            f'reversing it does not undo the coterie donation. Please check the coterie\'s '
            f'domain/pool state manually.',
            'warning',
        )
    return redirect(url_for('spends.history'))


@bp.route('/bulk-approve', methods=['POST'])
@require_staff
def bulk_approve():
    """Approve multiple spend requests at once using validated XP costs."""
    row_ids_raw = request.form.getlist('spend_ids')
    if not row_ids_raw:
        flash('No spend requests selected.', 'warning')
        return redirect(url_for('spends.pending'))

    row_ids = []
    for raw in row_ids_raw:
        try:
            row_ids.append(int(raw))
        except (ValueError, TypeError):
            pass

    staff = get_staff_user()
    approved_count = 0
    skipped = []

    for row_id in row_ids:
        spend = db_service.get_spend_by_row(row_id)
        if not spend or spend.status.lower() != 'pending':
            continue

        if spend.depends_on:
            parent = db_service.get_spend_by_row(spend.depends_on)
            if not parent or parent.status.lower() != 'approved':
                skipped.append(
                    f'{spend.character_name} / {spend.trait_name} (dependency not yet approved)'
                )
                continue

        validation = validate_spend_request(
            category=spend.spend_category,
            current_dots=spend.current_dots,
            new_dots=spend.new_dots,
            player_cost=spend.xp_cost,
        )
        if not validation.get('valid', False):
            skipped.append(f'{spend.character_name} / {spend.trait_name}')
            continue

        verified_cost = validation['correct_cost']

        available_xp = db_service.get_xp_totals(spend.character_name)['available_xp']
        if verified_cost > available_xp:
            skipped.append(
                f'{spend.character_name} / {spend.trait_name} '
                f'(insufficient XP: has {available_xp}, needs {verified_cost})'
            )
            continue

        # Same re-check as the single-approve path: two identical Skill
        # Specialty requests can both pass submit_spend's duplicate check
        # before either is approved, so re-validate live right before
        # charging rather than trusting the submit-time check still holds.
        if (
            spend.spend_category == 'Skill Specialty'
            and character_has_specialty(spend.character_name, spend.trait_name, spend.power_name)
        ):
            skipped.append(
                f'{spend.character_name} / {spend.trait_name} '
                f'(duplicate "{spend.power_name}" specialty — already approved elsewhere)'
            )
            continue

        db_service.approve_spend(row_id, verified_cost, staff, '')
        patch_character_draft(spend)
        db_service.log_action(
            staff_user=staff,
            action_type='approve_spend',
            target=spend.character_name,
            details=(
                f'Bulk approved spend: {spend.trait_name} '
                f'({spend.current_dots}→{spend.new_dots}) '
                f'for {verified_cost} XP'
            ),
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
                notes='',
            )
            sheets_sync.sync_log_action(
                staff_user=staff,
                action_type='approve_spend',
                target=spend.character_name,
                details=(
                    f'Bulk approved spend: {spend.trait_name} '
                    f'({spend.current_dots}→{spend.new_dots}) '
                    f'for {verified_cost} XP'
                ),
            )
        approved_count += 1

    if approved_count:
        flash(f'Approved {approved_count} spend request{"s" if approved_count != 1 else ""}.', 'success')
    if skipped:
        flash(
            f'Skipped {len(skipped)} spend{"s" if len(skipped) != 1 else ""} with '
            f'cost validation issues (review individually): '
            + ', '.join(skipped),
            'warning',
        )

    return redirect(url_for('spends.pending'))


@bp.route('/history')
@require_staff
def history():
    """View reviewed spend requests (approved/denied), most recent first."""
    reviewed = [s for s in db_service.get_all_spends() if s.status.lower() != 'pending']
    reviewed.sort(key=lambda s: s.review_date, reverse=True)
    return render_template('spends/history.html', spends=reviewed)
