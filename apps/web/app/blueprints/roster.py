"""Character roster management routes."""

from flask import (
    Blueprint, render_template, request, redirect, url_for, flash, abort
)
from app import db_service, sheets_sync
from app.auth import require_staff, get_staff_user
from app.models import Character, CLANS, AGE_CATEGORIES, SECTS

bp = Blueprint('roster', __name__)


def _parse_creation_xp(raw_value: str | None) -> int:
    """Parse Creation/Audit XP from forms; blank means reset to 0."""
    value = (raw_value or '').strip()
    if not value:
        return 0
    return int(value)


@bp.route('/')
@require_staff
def list_characters():
    """List all characters with filtering."""
    show = request.args.get('show', 'active')  # active, inactive, all
    clan_filter = request.args.get('clan', request.args.get('clan_filter', ''))
    sect_filter = request.args.get('sect', request.args.get('sect_filter', ''))

    characters = db_service.get_all_characters()
    xp_by_character = {
        row['character_name'].lower(): row['available_xp']
        for row in db_service.get_dashboard_data()
    }

    if show == 'active':
        characters = [c for c in characters if c.active]
    elif show == 'inactive':
        characters = [c for c in characters if not c.active]

    if clan_filter:
        characters = [c for c in characters
                      if c.clan.lower() == clan_filter.lower()]
    if sect_filter:
        characters = [c for c in characters
                      if c.sect.lower() == sect_filter.lower()]

    # Compute available XP for each character
    char_data = []
    for c in characters:
        char_data.append({
            'char': c,
            'available_xp': xp_by_character.get(c.character_name.lower(), 0),
        })

    return render_template(
        'roster/list.html',
        char_data=char_data,
        show=show,
        clan_filter=clan_filter,
        sect_filter=sect_filter,
        clans=CLANS,
        sects=SECTS,
    )


@bp.route('/add', methods=['GET'])
@require_staff
def add_form():
    """Show form to add a new character."""
    return render_template(
        'roster/add.html',
        clans=CLANS,
        age_categories=AGE_CATEGORIES,
        sects=SECTS,
    )


@bp.route('/add', methods=['POST'])
@require_staff
def add():
    """Add a new character to the roster."""
    name = request.form.get('character_name', '').strip()
    if not name:
        flash('Character name is required.', 'danger')
        return redirect(url_for('roster.add_form'))

    # Check for duplicates
    existing = db_service.get_character(name)
    if existing:
        flash(f'Character "{name}" already exists.', 'danger')
        return redirect(url_for('roster.add_form'))

    try:
        creation_xp = _parse_creation_xp(request.form.get('creation_xp'))
    except ValueError:
        flash('Creation / Audit XP must be a whole number.', 'danger')
        return redirect(url_for('roster.add_form'))

    char = Character(
        character_name=name,
        player_discord=request.form.get('player_discord', '').strip(),
        player_discord_name=request.form.get('player_discord_name', '').strip(),
        clan=request.form.get('clan', ''),
        age_category=request.form.get('age_category', ''),
        sect=request.form.get('sect', ''),
        active=True,
        creation_xp=creation_xp,
        enemy=request.form.get('enemy', '').strip(),
        notes=request.form.get('notes', '').strip(),
    )

    db_service.add_character(char)
    if sheets_sync:
        sheets_sync.sync_add_character(char)

    staff = get_staff_user()
    db_service.log_action(
        staff_user=staff,
        action_type='add_character',
        target=name,
        details=f'Added character: {name} ({char.clan}, {char.sect})',
    )
    if sheets_sync:
        sheets_sync.sync_log_action(
            staff_user=staff,
            action_type='add_character',
            target=name,
            details=f'Added character: {name} ({char.clan}, {char.sect})',
        )

    flash(f'Added {name} to the roster.', 'success')
    return redirect(url_for('roster.detail', name=name))


@bp.route('/<name>')
@require_staff
def detail(name):
    """Character detail page with full XP history."""
    char = db_service.get_character(name)
    if not char:
        abort(404)

    claims = db_service.get_claims_for_character(name)
    spends = db_service.get_spends_for_character(name)
    ledger = db_service.get_ledger_for_character(name)

    # Compute XP totals (includes ledger)
    xp = db_service.get_xp_totals(name)

    pending_claims_count = sum(1 for c in claims if c.status.lower() == 'pending')
    pending_spends_count = sum(1 for s in spends if s.status.lower() == 'pending')

    return render_template(
        'roster/detail.html',
        char=char,
        spends=spends,
        pending_claims_count=pending_claims_count,
        pending_spends_count=pending_spends_count,
        earned_xp=xp['earned_xp'],
        total_xp=xp['total_xp'],
        total_spends=xp['total_spends'] + xp['ledger_spent'],
        available_xp=xp['available_xp'],
        ledger=ledger,
    )


@bp.route('/<name>/ledger/add', methods=['POST'])
@require_staff
def add_ledger_entry(name):
    """Add a new XP ledger entry for a character."""
    char = db_service.get_character(name)
    if not char:
        abort(404)

    date_raw = request.form.get('date', '').strip()
    awarded = int(request.form.get('awarded', 0) or 0)
    spent = int(request.form.get('spent', 0) or 0)
    reason = request.form.get('reason', '').strip()

    if not date_raw or not reason:
        flash('Date and reason are required.', 'danger')
        return redirect(url_for('roster.detail', name=name))

    if awarded == 0 and spent == 0:
        flash('Enter either an awarded or spent amount.', 'danger')
        return redirect(url_for('roster.detail', name=name))

    # Convert browser date (YYYY-MM-DD) to YYYYMMDD
    date = date_raw.replace('-', '')
    staff = get_staff_user()
    db_service.add_ledger_entry(name, date, awarded, spent, reason, staff)
    if sheets_sync:
        sheets_sync.sync_add_ledger_entry(
            character_name=name,
            date=date,
            awarded=awarded,
            spent=spent,
            reason=reason,
            staff_user=staff,
        )
    db_service.log_action(
        staff_user=staff,
        action_type='ledger_entry',
        target=name,
        details=f'Ledger: +{awarded}/-{spent} XP on {date}: {reason}',
    )
    if sheets_sync:
        sheets_sync.sync_log_action(
            staff_user=staff,
            action_type='ledger_entry',
            target=name,
            details=f'Ledger: +{awarded}/-{spent} XP on {date}: {reason}',
        )
    flash(f'Ledger entry added for {name}.', 'success')
    return redirect(url_for('roster.detail', name=name))


@bp.route('/<name>/ledger/<int:row_index>/delete', methods=['POST'])
@require_staff
def delete_ledger_entry(name, row_index):
    """Delete an XP ledger entry."""
    char = db_service.get_character(name)
    if not char:
        abort(404)

    staff = get_staff_user()
    db_service.delete_ledger_entry(row_index)
    db_service.log_action(
        staff_user=staff,
        action_type='delete_ledger_entry',
        target=name,
        details=f'Deleted ledger entry row {row_index}',
    )
    if sheets_sync:
        sheets_sync.sync_log_action(
            staff_user=staff,
            action_type='delete_ledger_entry',
            target=name,
            details=f'Deleted ledger entry row {row_index}',
        )
    flash('Ledger entry deleted.', 'warning')
    return redirect(url_for('roster.detail', name=name))


@bp.route('/<name>/ledger/import', methods=['GET', 'POST'])
@require_staff
def import_ledger(name):
    """Import XP ledger entries from an external Google Sheet."""
    char = db_service.get_character(name)
    if not char:
        abort(404)

    if request.method == 'GET':
        return render_template(
            'roster/import_ledger.html',
            char=char,
            entries=None,
            sheet_url='',
        )

    # ── POST: either preview or confirm ──────────────────────────────
    action = request.form.get('action', 'preview')
    sheet_url = request.form.get('sheet_url', '').strip()

    if action == 'preview':
        if not sheet_url:
            flash('Please paste a Google Sheet URL.', 'danger')
            return redirect(url_for('roster.import_ledger', name=name))
        try:
            entries = db_service.preview_ledger_import(sheet_url)
        except Exception as e:
            flash(f'Error reading spreadsheet: {e}', 'danger')
            return redirect(url_for('roster.import_ledger', name=name))

        if not entries:
            flash('No importable rows found. Make sure the sheet has '
                  'Date, Awarded, Spent, and Reason columns.', 'warning')
            return redirect(url_for('roster.import_ledger', name=name))

        return render_template(
            'roster/import_ledger.html',
            char=char,
            entries=entries,
            sheet_url=sheet_url,
        )

    elif action == 'confirm':
        # Re-parse and import
        if not sheet_url:
            flash('Missing spreadsheet URL.', 'danger')
            return redirect(url_for('roster.import_ledger', name=name))

        try:
            entries = db_service.preview_ledger_import(sheet_url)
            staff = get_staff_user()
            count = db_service.bulk_add_ledger_entries(name, entries, staff)
            db_service.log_action(
                staff_user=staff,
                action_type='ledger_import',
                target=name,
                details=f'Imported {count} ledger entries from external sheet',
            )
            if sheets_sync:
                sheets_sync.sync_log_action(
                    staff_user=staff, action_type='ledger_import',
                    target=name, details=f'Imported {count} ledger entries from external sheet',
                )
            flash(f'Successfully imported {count} ledger entries for {name}.', 'success')
        except Exception as e:
            flash(f'Import failed: {e}', 'danger')

        return redirect(url_for('roster.detail', name=name))

    return redirect(url_for('roster.import_ledger', name=name))


@bp.route('/<name>/edit', methods=['GET'])
@require_staff
def edit_form(name):
    """Show edit form for a character."""
    char = db_service.get_character(name)
    if not char:
        abort(404)

    return render_template(
        'roster/edit.html',
        char=char,
        clans=CLANS,
        age_categories=AGE_CATEGORIES,
        sects=SECTS,
    )


@bp.route('/<name>/edit', methods=['POST'])
@require_staff
def edit(name):
    """Update character details."""
    char = db_service.get_character(name)
    if not char:
        abort(404)

    updates = {}
    for field in ['player_discord', 'player_discord_name', 'clan',
                  'age_category', 'sect', 'enemy', 'notes']:
        val = request.form.get(field, '').strip()
        if val != getattr(char, field, ''):
            updates[field] = val

    try:
        creation_xp = _parse_creation_xp(request.form.get('creation_xp'))
    except ValueError:
        flash('Creation / Audit XP must be a whole number.', 'danger')
        return redirect(url_for('roster.edit_form', name=name))

    if creation_xp != char.creation_xp:
        updates['creation_xp'] = creation_xp

    if updates:
        db_service.update_character(name, updates)
        staff = get_staff_user()
        db_service.log_action(
            staff_user=staff,
            action_type='edit_character',
            target=name,
            details=f'Updated fields: {", ".join(updates.keys())}',
        )
        if sheets_sync:
            sheets_sync.sync_log_action(
                staff_user=staff,
                action_type='edit_character',
                target=name,
                details=f'Updated fields: {", ".join(updates.keys())}',
            )
        flash(f'Updated {name}.', 'success')
    else:
        flash('No changes detected.', 'info')

    return redirect(url_for('roster.detail', name=name))


@bp.route('/<name>/adjust-xp', methods=['GET'])
@require_staff
def adjust_xp_form(name):
    """Show XP adjustment form."""
    char = db_service.get_character(name)
    if not char:
        abort(404)

    # Compute current XP totals for context (includes ledger)
    xp = db_service.get_xp_totals(name)

    return render_template(
        'roster/adjust_xp.html',
        char=char,
        earned_xp=xp['earned_xp'],
        total_xp=xp['total_xp'],
        total_spends=xp['total_spends'] + xp['ledger_spent'],
        available_xp=xp['available_xp'],
    )


@bp.route('/<name>/adjust-xp', methods=['POST'])
@require_staff
def adjust_xp(name):
    """Apply a manual XP adjustment."""
    char = db_service.get_character(name)
    if not char:
        abort(404)

    adjustment_type = request.form.get('adjustment_type', '')
    xp_amount = int(request.form.get('xp_amount', 0))
    reason = request.form.get('reason', '').strip()

    if not reason:
        flash('A reason is required for all XP adjustments.', 'danger')
        return redirect(url_for('roster.adjust_xp_form', name=name))

    if xp_amount == 0:
        flash('XP amount cannot be zero.', 'danger')
        return redirect(url_for('roster.adjust_xp_form', name=name))

    staff = get_staff_user()
    from datetime import date
    today = date.today().strftime('%Y%m%d')

    if adjustment_type == 'grant_xp':
        # Add earned XP as a ledger award
        db_service.add_ledger_entry(
            name, today, abs(xp_amount), 0,
            f'Staff Adjustment: {reason}', staff
        )
        if sheets_sync:
            sheets_sync.sync_add_ledger_entry(
                character_name=name, date=today, awarded=abs(xp_amount), spent=0,
                reason=f'Staff Adjustment: {reason}', staff_user=staff,
            )
        db_service.log_action(
            staff_user=staff,
            action_type='xp_adjustment',
            target=name,
            details=f'Granted {abs(xp_amount)} XP: {reason}',
        )
        if sheets_sync:
            sheets_sync.sync_log_action(staff_user=staff, action_type='xp_adjustment',
                                        target=name, details=f'Granted {abs(xp_amount)} XP: {reason}')
        flash(f'Granted {abs(xp_amount)} XP to {name}.', 'success')

    elif adjustment_type == 'remove_xp':
        # Remove earned XP as a negative ledger award
        db_service.add_ledger_entry(
            name, today, -abs(xp_amount), 0,
            f'Staff Adjustment (removal): {reason}', staff
        )
        if sheets_sync:
            sheets_sync.sync_add_ledger_entry(
                character_name=name, date=today, awarded=-abs(xp_amount), spent=0,
                reason=f'Staff Adjustment (removal): {reason}', staff_user=staff,
            )
        db_service.log_action(
            staff_user=staff,
            action_type='xp_adjustment',
            target=name,
            details=f'Removed {abs(xp_amount)} XP: {reason}',
        )
        if sheets_sync:
            sheets_sync.sync_log_action(staff_user=staff, action_type='xp_adjustment',
                                        target=name, details=f'Removed {abs(xp_amount)} XP: {reason}')
        flash(f'Removed {abs(xp_amount)} XP from {name}.', 'warning')

    elif adjustment_type == 'refund_spend':
        # Refund a spend as a negative ledger spend
        db_service.add_ledger_entry(
            name, today, 0, -abs(xp_amount),
            f'Staff Refund: {reason}', staff
        )
        if sheets_sync:
            sheets_sync.sync_add_ledger_entry(
                character_name=name, date=today, awarded=0, spent=-abs(xp_amount),
                reason=f'Staff Refund: {reason}', staff_user=staff,
            )
        db_service.log_action(
            staff_user=staff,
            action_type='spend_adjustment',
            target=name,
            details=f'Refunded {abs(xp_amount)} XP spend: {reason}',
        )
        if sheets_sync:
            sheets_sync.sync_log_action(staff_user=staff, action_type='spend_adjustment',
                                        target=name, details=f'Refunded {abs(xp_amount)} XP spend: {reason}')
        flash(f'Refunded {abs(xp_amount)} XP of spends for {name}.', 'success')

    elif adjustment_type == 'add_spend':
        # Record a spend retroactively as a ledger spend
        db_service.add_ledger_entry(
            name, today, 0, abs(xp_amount),
            f'Staff Adjustment: {reason}', staff
        )
        if sheets_sync:
            sheets_sync.sync_add_ledger_entry(
                character_name=name, date=today, awarded=0, spent=abs(xp_amount),
                reason=f'Staff Adjustment: {reason}', staff_user=staff,
            )
        db_service.log_action(
            staff_user=staff,
            action_type='spend_adjustment',
            target=name,
            details=f'Added {abs(xp_amount)} XP spend: {reason}',
        )
        if sheets_sync:
            sheets_sync.sync_log_action(staff_user=staff, action_type='spend_adjustment',
                                        target=name, details=f'Added {abs(xp_amount)} XP spend: {reason}')
        flash(f'Added {abs(xp_amount)} XP spend for {name}.', 'info')

    else:
        flash('Invalid adjustment type.', 'danger')
        return redirect(url_for('roster.adjust_xp_form', name=name))

    return redirect(url_for('roster.detail', name=name))


@bp.route('/<name>/deactivate', methods=['POST'])
@require_staff
def deactivate(name):
    """Deactivate a character."""
    char = db_service.get_character(name)
    if not char:
        abort(404)

    db_service.deactivate_character(name)

    staff = get_staff_user()
    db_service.log_action(
        staff_user=staff,
        action_type='deactivate_character',
        target=name,
        details=f'Deactivated {name}',
    )
    if sheets_sync:
        sheets_sync.sync_log_action(
            staff_user=staff, action_type='deactivate_character',
            target=name, details=f'Deactivated {name}',
        )

    flash(f'{name} has been deactivated.', 'warning')
    return redirect(url_for('roster.list_characters'))


@bp.route('/<name>/activate', methods=['POST'])
@require_staff
def activate(name):
    """Re-activate a character."""
    char = db_service.get_character(name)
    if not char:
        abort(404)

    db_service.update_character(name, {'active': 'TRUE'})

    staff = get_staff_user()
    db_service.log_action(
        staff_user=staff,
        action_type='activate_character',
        target=name,
        details=f'Re-activated {name}',
    )
    if sheets_sync:
        sheets_sync.sync_log_action(
            staff_user=staff, action_type='activate_character',
            target=name, details=f'Re-activated {name}',
        )

    flash(f'{name} has been re-activated.', 'success')
    return redirect(url_for('roster.detail', name=name))


@bp.route('/<name>/delete', methods=['POST'])
@require_staff
def delete(name):
    """Permanently delete a character from the roster."""
    char = db_service.get_character(name)
    if not char:
        abort(404)

    # Guard: only inactive characters may be deleted
    if char.active:
        flash('Deactivate the character before deleting.', 'danger')
        return redirect(url_for('roster.detail', name=name))

    # Require the user to confirm by typing the character name
    confirm = request.form.get('confirm_name', '').strip()
    if confirm.lower() != name.lower():
        flash('Confirmation name did not match. Character was NOT deleted.', 'danger')
        return redirect(url_for('roster.detail', name=name))

    staff = get_staff_user()
    db_service.delete_character(name)
    db_service.log_action(
        staff_user=staff,
        action_type='delete_character',
        target=name,
        details=f'Permanently deleted character {name}',
    )
    if sheets_sync:
        sheets_sync.sync_log_action(
            staff_user=staff, action_type='delete_character',
            target=name, details=f'Permanently deleted character {name}',
        )

    flash(f'{name} has been permanently deleted.', 'danger')
    return redirect(url_for('roster.list_characters'))
