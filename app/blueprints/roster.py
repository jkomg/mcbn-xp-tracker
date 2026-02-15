"""Character roster management routes."""

from flask import (
    Blueprint, render_template, request, redirect, url_for, flash, abort
)
from app import sheets_client
from app.auth import require_staff, get_staff_user
from app.models import Character, CLANS, AGE_CATEGORIES, SECTS

bp = Blueprint('roster', __name__)


@bp.route('/')
@require_staff
def list_characters():
    """List all characters with filtering."""
    show = request.args.get('show', 'active')  # active, inactive, all
    clan_filter = request.args.get('clan', '')
    sect_filter = request.args.get('sect', '')

    characters = sheets_client.get_all_characters()

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

    return render_template(
        'roster/list.html',
        characters=characters,
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
    existing = sheets_client.get_character(name)
    if existing:
        flash(f'Character "{name}" already exists.', 'danger')
        return redirect(url_for('roster.add_form'))

    char = Character(
        character_name=name,
        player_discord=request.form.get('player_discord', '').strip(),
        clan=request.form.get('clan', ''),
        age_category=request.form.get('age_category', ''),
        sect=request.form.get('sect', ''),
        active=True,
        creation_xp=int(request.form.get('creation_xp', 0)),
        enemy=request.form.get('enemy', '').strip(),
        notes=request.form.get('notes', '').strip(),
    )

    sheets_client.add_character(char)

    staff = get_staff_user()
    sheets_client.log_action(
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
    char = sheets_client.get_character(name)
    if not char:
        abort(404)

    claims = sheets_client.get_claims_for_character(name)
    spends = sheets_client.get_spends_for_character(name)

    # Compute XP totals
    earned_xp = sum(
        c.approved_xp for c in claims if c.status.lower() == 'approved'
    )
    total_spends = sum(
        s.verified_cost for s in spends if s.status.lower() == 'approved'
    )
    total_xp = char.creation_xp + earned_xp
    available_xp = total_xp - total_spends

    return render_template(
        'roster/detail.html',
        char=char,
        claims=claims,
        spends=spends,
        earned_xp=earned_xp,
        total_xp=total_xp,
        total_spends=total_spends,
        available_xp=available_xp,
    )


@bp.route('/<name>/edit', methods=['GET'])
@require_staff
def edit_form(name):
    """Show edit form for a character."""
    char = sheets_client.get_character(name)
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
    char = sheets_client.get_character(name)
    if not char:
        abort(404)

    updates = {}
    for field in ['player_discord', 'clan', 'age_category', 'sect',
                  'enemy', 'notes']:
        val = request.form.get(field, '').strip()
        if val != getattr(char, field, ''):
            updates[field] = val

    creation_xp = int(request.form.get('creation_xp', char.creation_xp))
    if creation_xp != char.creation_xp:
        updates['creation_xp'] = creation_xp

    if updates:
        sheets_client.update_character(name, updates)
        staff = get_staff_user()
        sheets_client.log_action(
            staff_user=staff,
            action_type='edit_character',
            target=name,
            details=f'Updated fields: {", ".join(updates.keys())}',
        )
        flash(f'Updated {name}.', 'success')
    else:
        flash('No changes detected.', 'info')

    return redirect(url_for('roster.detail', name=name))


@bp.route('/<name>/deactivate', methods=['POST'])
@require_staff
def deactivate(name):
    """Deactivate a character."""
    char = sheets_client.get_character(name)
    if not char:
        abort(404)

    sheets_client.deactivate_character(name)

    staff = get_staff_user()
    sheets_client.log_action(
        staff_user=staff,
        action_type='deactivate_character',
        target=name,
        details=f'Deactivated {name}',
    )

    flash(f'{name} has been deactivated.', 'warning')
    return redirect(url_for('roster.list_characters'))


@bp.route('/<name>/activate', methods=['POST'])
@require_staff
def activate(name):
    """Re-activate a character."""
    char = sheets_client.get_character(name)
    if not char:
        abort(404)

    sheets_client.update_character(name, {'active': 'TRUE'})

    staff = get_staff_user()
    sheets_client.log_action(
        staff_user=staff,
        action_type='activate_character',
        target=name,
        details=f'Re-activated {name}',
    )

    flash(f'{name} has been re-activated.', 'success')
    return redirect(url_for('roster.detail', name=name))
