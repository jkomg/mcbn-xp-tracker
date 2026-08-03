"""Character roster management routes."""

import csv
import io
import json
import logging
from datetime import datetime, timezone
from flask import (
    Blueprint, render_template, request, redirect, url_for, flash, abort,
    Response,
)
from app import db_service, sheets_sync
from app.auth import require_staff, get_staff_user
from app.models import Character, CLANS, AGE_CATEGORIES, SECTS
from app.db import CharacterDraft, DbCharacter, db
from app.retirement_automation import enqueue_retirement_job

logger = logging.getLogger(__name__)

bp = Blueprint('roster', __name__)

_CSV_INJECTION_PREFIXES = ('=', '+', '-', '@', '\t', '\r')


def _csv_safe(value: str) -> str:
    """Prefix formula-injection characters so Excel/Sheets won't execute them."""
    s = str(value)
    if s and s[0] in _CSV_INJECTION_PREFIXES:
        return "'" + s
    return s


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
    from app.db import WikiPage
    show = request.args.get('show', 'active')  # active, inactive, all
    clan_filter = request.args.get('clan', request.args.get('clan_filter', ''))
    sect_filter = request.args.get('sect', request.args.get('sect_filter', ''))
    portrait_filter = request.args.get('portrait', '')  # '' | 'missing'

    characters = db_service.get_all_characters()
    xp_by_character = {
        row['character_name'].lower(): row['available_xp']
        for row in db_service.get_dashboard_data()
    }

    # Build portrait status map: name.lower() → 'yes' | 'no' | 'none'
    wiki_pages = {p.title.lower(): p for p in WikiPage.query.all()}
    def _portrait_status(name: str) -> str:
        page = wiki_pages.get(name.lower())
        if page is None:
            return 'none'
        return 'yes' if page.cover_image_url else 'no'

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
    if portrait_filter == 'missing':
        characters = [c for c in characters
                      if _portrait_status(c.character_name) != 'yes']

    char_data = []
    for c in characters:
        char_data.append({
            'char': c,
            'available_xp': xp_by_character.get(c.character_name.lower(), 0),
            'portrait': _portrait_status(c.character_name),
        })

    return render_template(
        'roster/list.html',
        char_data=char_data,
        show=show,
        clan_filter=clan_filter,
        sect_filter=sect_filter,
        portrait_filter=portrait_filter,
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


@bp.route('/<name>/xp-audit')
@require_staff
def xp_audit(name):
    """Unified XP audit trail — combined chronological timeline for a character."""
    timeline = db_service.get_xp_timeline(name)
    if not timeline:
        abort(404)
    # Rename pending_claims/pending_spends to avoid colliding with the integer
    # navbar context variables of the same name in base.html.
    timeline['pending_claim_list'] = timeline.pop('pending_claims')
    timeline['pending_spend_list'] = timeline.pop('pending_spends')
    return render_template('roster/xp_audit.html', **timeline)


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
    reason = request.form.get('reason', '').strip()[:500]

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
                  'age_category', 'sect', 'enemy', 'notes', 'ticket_channel_id']:
        val = request.form.get(field, '').strip()
        # Nullable fields: compare and store as None rather than empty string
        if field == 'ticket_channel_id':
            val = val or None
            current = getattr(char, field, None) or None
        else:
            current = getattr(char, field, '') or ''
        if val != current:
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
    reason = request.form.get('reason', '').strip()[:500]

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

    db_service.set_character_status(name, 'active')

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


@bp.route('/<name>/set-status', methods=['POST'])
@require_staff
def set_status(name):
    """Set a character's status to deceased or retired."""
    char = db_service.get_character(name)
    if not char:
        abort(404)
    previous_status = char.status or ('active' if char.active else 'retired')
    new_status = request.form.get('status', '').strip()
    if new_status not in ('active', 'deceased', 'retired'):
        flash('Invalid status.', 'danger')
        return redirect(url_for('roster.detail', name=name))

    db_service.set_character_status(name, new_status)

    staff = get_staff_user()
    db_service.log_action(
        staff_user=staff,
        action_type='set_character_status',
        target=name,
        details=f'Set status to {new_status}',
    )
    if previous_status != 'retired' and new_status == 'retired':
        enqueue_retirement_job(name, staff)
        db.session.commit()

    labels = {'active': 'reactivated', 'deceased': 'marked as deceased', 'retired': 'marked as retired'}
    flash(f'{name} has been {labels[new_status]}.', 'warning' if new_status != 'active' else 'success')
    return redirect(url_for('roster.detail', name=name))

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


@bp.route('/<name>/rename', methods=['POST'])
@require_staff
def rename(name):
    """Rename a character and migrate all related records."""
    char = db_service.get_character(name)
    if not char:
        abort(404)

    new_name = request.form.get('new_name', '').strip()
    if not new_name:
        flash('New name is required.', 'danger')
        return redirect(url_for('roster.detail', name=name))

    if new_name.lower() == name.lower():
        flash('New name is the same as the current name.', 'warning')
        return redirect(url_for('roster.detail', name=name))

    staff = get_staff_user()
    try:
        db_service.rename_character(name, new_name)
    except ValueError as e:
        flash(str(e), 'danger')
        return redirect(url_for('roster.detail', name=name))

    db_service.log_action(
        staff_user=staff,
        action_type='rename_character',
        target=new_name,
        details=f'Renamed character: "{name}" → "{new_name}"',
    )
    if sheets_sync:
        sheets_sync.sync_log_action(
            staff_user=staff,
            action_type='rename_character',
            target=new_name,
            details=f'Renamed character: "{name}" → "{new_name}"',
        )

    flash(f'Character renamed from "{name}" to "{new_name}". All XP records updated.', 'success')
    return redirect(url_for('roster.detail', name=new_name))


@bp.route('/import-csv', methods=['GET', 'POST'])
@require_staff
def import_csv():
    """Bulk-import characters from a CSV file."""
    if request.method == 'GET':
        return render_template('roster/import_csv.html')

    file = request.files.get('csv_file')
    if not file or not file.filename:
        flash('Please select a CSV file.', 'danger')
        return redirect(url_for('roster.import_csv'))

    try:
        content = file.read().decode('utf-8-sig')
    except UnicodeDecodeError:
        flash('Could not read file — please use UTF-8 encoding.', 'danger')
        return redirect(url_for('roster.import_csv'))

    reader = csv.DictReader(io.StringIO(content))
    if 'character_name' not in (reader.fieldnames or []):
        flash('CSV must have a "character_name" column.', 'danger')
        return redirect(url_for('roster.import_csv'))

    existing = {c.character_name.lower() for c in db_service.get_all_characters()}
    staff = get_staff_user()
    created = 0
    skipped = 0

    for row in reader:
        name = (row.get('character_name') or '').strip()
        if not name:
            continue
        if name.lower() in existing:
            skipped += 1
            continue

        try:
            creation_xp = int(row.get('creation_xp') or 0)
        except (ValueError, TypeError):
            creation_xp = 0

        char = Character(
            character_name=name,
            clan=(row.get('clan') or '').strip(),
            age_category=(row.get('age_category') or '').strip(),
            sect=(row.get('sect') or '').strip(),
            creation_xp=creation_xp,
            player_discord=(row.get('player_discord') or '').strip(),
            notes=(row.get('notes') or '').strip(),
        )
        db_service.add_character(char)
        if sheets_sync:
            sheets_sync.sync_add_character(char)
        db_service.log_action(
            staff_user=staff,
            action_type='add_character',
            target=name,
            details='Imported via CSV',
        )
        existing.add(name.lower())
        created += 1

    parts = []
    if created:
        parts.append(f'Imported {created} character{"s" if created != 1 else ""}.')
    if skipped:
        parts.append(f'Skipped {skipped} already existing.')
    flash(
        ' '.join(parts) or 'No new characters found in CSV.',
        'success' if created else 'warning',
    )
    return redirect(url_for('roster.list_characters'))


@bp.route('/<name>/export.csv')
@require_staff
def export_xp_csv(name):
    """Download full XP transaction history as CSV (staff view — all statuses)."""
    char = db_service.get_character(name)
    if not char:
        abort(404)

    claims = db_service.get_claims_for_character(name)
    spends = db_service.get_spends_for_character(name)
    ledger = db_service.get_ledger_for_character(name)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(['Type', 'Date', 'Description', 'XP Change', 'Status', 'Staff', 'Notes'])

    for c in sorted(claims, key=lambda x: x.timestamp or ''):
        if c.status.lower() == 'approved':
            writer.writerow([
                'Claim', c.review_date or c.timestamp,
                _csv_safe(f'XP Claim: {c.play_period}'),
                f'+{c.approved_xp}', 'Approved',
                _csv_safe(c.reviewed_by or ''), _csv_safe(c.st_notes or ''),
            ])
        elif c.status.lower() == 'denied':
            writer.writerow([
                'Claim', c.review_date or c.timestamp,
                _csv_safe(f'XP Claim: {c.play_period}'),
                '0', 'Denied',
                _csv_safe(c.reviewed_by or ''), _csv_safe(c.st_notes or ''),
            ])
        else:
            writer.writerow([
                'Claim', c.timestamp,
                _csv_safe(f'XP Claim: {c.play_period}'),
                '?', c.status, '', '',
            ])

    for s in sorted(spends, key=lambda x: x.timestamp or ''):
        if s.status.lower() == 'approved':
            writer.writerow([
                'Spend', s.review_date or s.timestamp,
                _csv_safe(f'{s.spend_category}: {s.trait_name} ({s.current_dots}→{s.new_dots})'),
                f'-{s.verified_cost}', 'Approved',
                _csv_safe(s.reviewed_by or ''), _csv_safe(s.st_notes or ''),
            ])
        elif s.status.lower() == 'denied':
            writer.writerow([
                'Spend', s.review_date or s.timestamp,
                _csv_safe(f'{s.spend_category}: {s.trait_name} ({s.current_dots}→{s.new_dots})'),
                '0', 'Denied',
                _csv_safe(s.reviewed_by or ''), _csv_safe(s.st_notes or ''),
            ])
        else:
            writer.writerow([
                'Spend', s.timestamp,
                _csv_safe(f'{s.spend_category}: {s.trait_name} ({s.current_dots}→{s.new_dots})'),
                f'-{s.xp_cost} (pending)', s.status, '', '',
            ])

    for e in sorted(ledger, key=lambda x: x.date or ''):
        if e.awarded != 0:
            sign = '+' if e.awarded > 0 else ''
            writer.writerow([
                'Ledger', e.date, _csv_safe(e.reason or 'Manual award'),
                f'{sign}{e.awarded}', 'Applied', _csv_safe(e.entered_by or ''), '',
            ])
        if e.spent != 0:
            sign = '-' if e.spent > 0 else '+'
            writer.writerow([
                'Ledger', e.date, _csv_safe(e.reason or 'Manual spend'),
                f'{sign}{abs(e.spent)}', 'Applied', _csv_safe(e.entered_by or ''), '',
            ])

    safe_name = ''.join(c for c in name if c.isalnum() or c in ' _-').strip().replace(' ', '_')
    return Response(
        buf.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': f'attachment; filename="{safe_name}_xp_history.csv"'},
    )


@bp.route('/<name>/edit-sheet', methods=['GET', 'POST'])
@require_staff
def edit_sheet(name):
    """Staff: view and edit a character's living sheet JSON."""
    char = db_service.get_character(name)
    if not char:
        abort(404)

    char_row = DbCharacter.query.filter(DbCharacter.character_name.ilike(name)).first()
    if not char_row:
        abort(404)

    draft = CharacterDraft.query.filter_by(
        roster_character_id=char_row.id,
        status='approved',
    ).first()

    if request.method == 'GET':
        sheet_data = json.loads(draft.character_data) if draft else {}
        sheet_json = json.dumps(sheet_data, indent=2) if draft else ''
        return render_template(
            'roster/edit_sheet.html',
            char=char,
            draft=draft,
            sheet_json=sheet_json,
            skill_specialties=sheet_data.get('skill_specialties', {}),
        )

    action = request.form.get('action', 'save')

    if action == 'delete':
        if draft:
            db.session.delete(draft)
            staff = get_staff_user()
            db_service.log_action(
                staff_user=staff,
                action_type='staff_sheet_delete',
                target=name,
                details='Staff deleted living character sheet',
            )
            db.session.commit()
            flash('Living sheet deleted. The player can re-import a new one.', 'success')
        return redirect(url_for('roster.detail', name=name))

    json_text = request.form.get('sheet_json', '').strip()
    if not json_text:
        flash('Sheet JSON cannot be empty.', 'danger')
        return render_template('roster/edit_sheet.html', char=char, draft=draft, sheet_json='')

    try:
        new_data = json.loads(json_text)
    except json.JSONDecodeError as exc:
        flash(f'Invalid JSON: {exc}', 'danger')
        return render_template('roster/edit_sheet.html', char=char, draft=draft, sheet_json=json_text)

    staff = get_staff_user()
    now = datetime.now(timezone.utc)

    if draft:
        draft.character_data = json.dumps(new_data)
        draft.updated_at = now
        draft.approved_by = f'staff:{staff} (manual edit)'
        action_details = 'Staff manually edited living character sheet'
    else:
        draft = CharacterDraft(
            player_discord_id=None,
            character_name=char_row.character_name,
            status='approved',
            roster_character_id=char_row.id,
            character_data=json.dumps(new_data),
            approved_at=now,
            approved_by=f'staff:{staff} (manual create)',
        )
        db.session.add(draft)
        action_details = 'Staff manually created living character sheet'

    db_service.log_action(
        staff_user=staff,
        action_type='staff_sheet_edit',
        target=name,
        details=action_details,
    )
    db.session.commit()
    flash('Character sheet saved.', 'success')
    return redirect(url_for('roster.detail', name=name))


@bp.route('/<name>/skill-specialty', methods=['POST'])
@require_staff
def edit_skill_specialty(name):
    """Staff: directly add or remove a skill specialty on the living sheet.

    No XP is charged and no spend-request row is created — this is a direct
    administrative correction, the same trust tier as the raw sheet-JSON
    editor above, not a player-facing purchase shortcut.
    """
    char_row = DbCharacter.query.filter(DbCharacter.character_name.ilike(name)).first()
    if not char_row:
        abort(404)

    draft = CharacterDraft.query.filter_by(
        roster_character_id=char_row.id,
        status='approved',
    ).first()
    if not draft or not draft.character_data:
        flash('No living sheet exists for this character yet.', 'danger')
        return redirect(url_for('roster.edit_sheet', name=name))

    action = request.form.get('action', '').strip()
    skill = request.form.get('skill', '').strip()
    specialty = request.form.get('specialty', '').strip()

    if action not in ('add', 'remove') or not skill or not specialty:
        flash('Skill and specialty name are required.', 'danger')
        return redirect(url_for('roster.edit_sheet', name=name))

    try:
        data = json.loads(draft.character_data)
    except (json.JSONDecodeError, TypeError):
        flash('Living sheet JSON is invalid; fix it in the editor first.', 'danger')
        return redirect(url_for('roster.edit_sheet', name=name))

    skill_key = skill.lower()
    specialties = data.setdefault('skill_specialties', {}).setdefault(skill_key, [])
    staff = get_staff_user()

    if action == 'add':
        if any((s or '').strip().lower() == specialty.lower() for s in specialties):
            flash(f'{skill} already has a "{specialty}" specialty.', 'danger')
            return redirect(url_for('roster.edit_sheet', name=name))
        specialties.append(specialty)
        details = f'Staff added specialty "{specialty}" to {skill}'
    else:
        match = next((s for s in specialties if (s or '').strip().lower() == specialty.lower()), None)
        if match is None:
            flash(f'{skill} has no "{specialty}" specialty to remove.', 'danger')
            return redirect(url_for('roster.edit_sheet', name=name))
        specialties.remove(match)
        details = f'Staff removed specialty "{specialty}" from {skill}'

    draft.character_data = json.dumps(data)
    draft.updated_at = datetime.now(timezone.utc)
    db_service.log_action(
        staff_user=staff,
        action_type='staff_skill_specialty_edit',
        target=name,
        details=details,
    )
    db.session.commit()
    flash(details + '.', 'success')
    return redirect(url_for('roster.edit_sheet', name=name))
