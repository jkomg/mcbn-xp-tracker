"""Player-facing routes. Requires Discord authentication."""

from flask import (
    Blueprint, render_template, request, abort, flash, redirect, url_for,
    session,
)
from app import db_service, sheets_sync
from app.auth import (
    require_login, require_character_owner, is_staff as check_is_staff,
    get_player_discord_id,
)
from app.models import SPEND_CATEGORIES
from app.game_calendar import get_calendar

bp = Blueprint('player', __name__)


@bp.route('/')
@require_login
def my_characters():
    """Player landing page showing their linked characters."""
    discord_id = get_player_discord_id()
    my_chars = db_service.get_characters_by_discord_id(discord_id)

    # Fetch open periods for the banner
    all_periods = db_service.get_all_periods()
    open_periods = [p for p in all_periods if p.submissions_open and p.active]
    open_periods.sort(key=lambda p: p.night_number, reverse=True)

    calendar = get_calendar()

    # Staff also see a full character search
    if check_is_staff():
        all_characters = db_service.get_active_characters()
        all_characters.sort(key=lambda c: c.character_name.lower())
        return render_template(
            'player/my_characters.html',
            my_characters=my_chars,
            all_characters=all_characters,
            show_all=True,
            open_periods=open_periods,
            calendar=calendar,
        )

    if not my_chars:
        # No linked characters — show linking flow
        return redirect(url_for('player.link_character'))

    # Show character list with option to link more
    return render_template(
        'player/my_characters.html',
        my_characters=my_chars,
        all_characters=None,
        show_all=False,
        open_periods=open_periods,
        calendar=calendar,
    )


@bp.route('/link', methods=['GET', 'POST'])
@require_login
def link_character():
    """Let a player link their Discord account to a character."""
    discord_id = get_player_discord_id()
    discord_name = session.get('discord_name', '')

    # Check if they already have characters
    existing = db_service.get_characters_by_discord_id(discord_id)

    if request.method == 'GET':
        unlinked = db_service.get_unlinked_characters()
        unlinked.sort(key=lambda c: c.character_name.lower())
        return render_template(
            'player/link_character.html',
            unlinked_characters=unlinked,
            existing_characters=existing,
        )

    # POST: process linking
    character_name = request.form.get('character_name', '').strip()
    if not character_name:
        flash('Please select a character.', 'danger')
        return redirect(url_for('player.link_character'))

    char = db_service.get_character(character_name)
    if not char:
        flash('Character not found.', 'danger')
        return redirect(url_for('player.link_character'))

    if char.player_discord and char.player_discord != discord_id:
        flash('This character is already linked to another player.', 'danger')
        return redirect(url_for('player.link_character'))

    db_service.link_character_to_discord(character_name, discord_id, discord_name)
    db_service.log_action(
        staff_user=f'player:{discord_name}',
        action_type='player_link_character',
        target=character_name,
        details=f'Player self-linked Discord ID {discord_id} ({discord_name})',
    )
    if sheets_sync:
        sheets_sync.sync_log_action(
            staff_user=f'player:{discord_name}',
            action_type='player_link_character',
            target=character_name,
            details=f'Player self-linked Discord ID {discord_id} ({discord_name})',
        )
    flash(f'Successfully linked {character_name} to your Discord account.', 'success')
    return redirect(url_for('player.character', name=character_name))


@bp.route('/<name>')
@require_character_owner
def character(name):
    """Character XP summary with submission forms."""
    char = db_service.get_character(name)
    if not char:
        abort(404)

    claims = db_service.get_claims_for_character(name)
    spends = db_service.get_spends_for_character(name)

    # Only show approved data to players
    approved_claims = [
        c for c in claims if c.status.lower() == 'approved'
    ]
    approved_spends = [
        s for s in spends if s.status.lower() == 'approved'
    ]
    pending_claims = [
        c for c in claims if c.status.lower() == 'pending'
    ]
    pending_spends = [
        s for s in spends if s.status.lower() == 'pending'
    ]

    ledger = db_service.get_ledger_for_character(name)

    # Compute XP totals (includes ledger)
    xp = db_service.get_xp_totals(name)

    # Open periods for claim form dropdown
    all_periods = db_service.get_all_periods()
    open_periods = [p for p in all_periods if p.submissions_open and p.active]
    open_periods.sort(key=lambda p: p.night_number, reverse=True)

    # Periods this character has already claimed (non-denied)
    claimed_periods = {
        c.play_period for c in claims
        if c.status.lower() != 'denied'
    }

    return render_template(
        'player/character.html',
        char=char,
        earned_xp=xp['earned_xp'],
        total_xp=xp['total_xp'],
        total_spends=xp['total_spends'] + xp['ledger_spent'],
        available_xp=xp['available_xp'],
        approved_claims=approved_claims,
        approved_spends=approved_spends,
        pending_claims_count=len(pending_claims),
        pending_spends_count=len(pending_spends),
        ledger=ledger,
        open_periods=open_periods,
        claimed_periods=claimed_periods,
        spend_categories=SPEND_CATEGORIES,
    )


@bp.route('/<name>/claim', methods=['POST'])
@require_character_owner
def submit_claim(name):
    """Submit an XP claim for a play period."""
    char = db_service.get_character(name)
    if not char or not char.active:
        abort(404)

    play_period = request.form.get('play_period', '').strip()
    if not play_period:
        flash('Please select a play period.', 'danger')
        return redirect(url_for('player.character', name=name))

    # Validate period exists and is open
    all_periods = db_service.get_all_periods()
    period = next((p for p in all_periods if p.period_label == play_period), None)
    if not period or not period.submissions_open:
        flash('That play period is not open for submissions.', 'danger')
        return redirect(url_for('player.character', name=name))

    # Collect checked categories and their links
    category_keys = [
        'posted_once', 'hunting_awakening', 'scene_with_another',
        'conflict', 'combat', 'unmitigated_stain', 'wildcard',
    ]
    categories = {}
    missing_links = []
    for key in category_keys:
        if request.form.get(key):
            link = request.form.get(f'{key}_link', '').strip()
            if not link:
                missing_links.append(key)
            categories[key] = link
    # Capture wildcard reason and amount if wildcard was checked
    if 'wildcard' in categories:
        wildcard_reason = request.form.get('wildcard_reason', '').strip()
        if not wildcard_reason:
            flash('Please provide a reason for the wildcard XP claim.', 'danger')
            return redirect(url_for('player.character', name=name))
        categories['wildcard_reason'] = wildcard_reason
        wildcard_amount = request.form.get('wildcard_amount', '1').strip()
        try:
            wildcard_amount = max(1, int(wildcard_amount))
        except (ValueError, TypeError):
            wildcard_amount = 1
        wildcard_amount = min(wildcard_amount, 10)
        categories['wildcard_amount'] = str(wildcard_amount)

    if not categories:
        flash('Please select at least one XP category to claim.', 'danger')
        return redirect(url_for('player.character', name=name))

    if missing_links:
        flash('A Discord post link is required for each claimed category.', 'danger')
        return redirect(url_for('player.character', name=name))

    try:
        # Count actual XP (standard cats = 1 each, wildcard = its amount)
        wc_amt = int(categories.get('wildcard_amount', 1)) if 'wildcard' in categories else 0
        xp_count = sum(1 for k in category_keys if k in categories and k != 'wildcard') + wc_amt
        discord_name = session.get('discord_name', 'unknown')
        db_service.submit_xp_claim(name, play_period, categories)
        if sheets_sync:
            sheets_sync.sync_add_claim(name, play_period, categories)
        db_service.log_action(
            staff_user=f'player:{discord_name}',
            action_type='player_claim_submitted',
            target=name,
            details=f'Claimed {xp_count} XP for {play_period}',
        )
        if sheets_sync:
            sheets_sync.sync_log_action(
                staff_user=f'player:{discord_name}',
                action_type='player_claim_submitted',
                target=name,
                details=f'Claimed {xp_count} XP for {play_period}',
            )
        flash(
            f'XP claim submitted for {play_period} — '
            f'{len(categories)} categor{"y" if len(categories) == 1 else "ies"} '
            f'claimed. Awaiting staff review.',
            'success',
        )
    except ValueError as e:
        flash(str(e), 'danger')

    return redirect(url_for('player.character', name=name))


@bp.route('/<name>/spend', methods=['POST'])
@require_character_owner
def submit_spend(name):
    """Submit a spend request."""
    char = db_service.get_character(name)
    if not char or not char.active:
        abort(404)

    spend_category = request.form.get('spend_category', '').strip()
    trait_name = request.form.get('trait_name', '').strip()
    justification = request.form.get('justification', '').strip()

    if not spend_category or not trait_name:
        flash('Category and trait name are required.', 'danger')
        return redirect(url_for('player.character', name=name))

    if spend_category not in SPEND_CATEGORIES:
        flash('Invalid spend category.', 'danger')
        return redirect(url_for('player.character', name=name))

    try:
        current_dots = int(request.form.get('current_dots', 0))
        new_dots = int(request.form.get('new_dots', 1))
    except (ValueError, TypeError):
        flash('Invalid dot values.', 'danger')
        return redirect(url_for('player.character', name=name))

    is_in_clan = bool(request.form.get('is_in_clan'))

    if not justification:
        flash('Please provide a justification for your spend request.', 'danger')
        return redirect(url_for('player.character', name=name))
    if current_dots < 0 or new_dots < 0 or new_dots > 10:
        flash('Dot ratings must be between 0 and 10.', 'danger')
        return redirect(url_for('player.character', name=name))

    try:
        discord_name = session.get('discord_name', 'unknown')
        xp_cost = db_service.submit_spend_request(
            character_name=name,
            spend_category=spend_category,
            trait_name=trait_name,
            current_dots=current_dots,
            new_dots=new_dots,
            is_in_clan=is_in_clan,
            justification=justification,
        )
        if sheets_sync:
            sheets_sync.sync_add_spend(
                character_name=name,
                spend_category=spend_category,
                trait_name=trait_name,
                current_dots=current_dots,
                new_dots=new_dots,
                is_in_clan=is_in_clan,
                justification=justification,
            )
        db_service.log_action(
            staff_user=f'player:{discord_name}',
            action_type='player_spend_submitted',
            target=name,
            details=f'{spend_category}: {trait_name} ({current_dots}→{new_dots}) for {xp_cost} XP',
        )
        if sheets_sync:
            sheets_sync.sync_log_action(
                staff_user=f'player:{discord_name}',
                action_type='player_spend_submitted',
                target=name,
                details=f'{spend_category}: {trait_name} ({current_dots}→{new_dots}) for {xp_cost} XP',
            )
        flash(
            f'Spend request submitted: {trait_name} '
            f'({current_dots}→{new_dots}) for {xp_cost} XP. '
            f'Awaiting staff review.',
            'success',
        )
    except ValueError as e:
        flash(f'Invalid spend request: {e}', 'danger')

    return redirect(url_for('player.character', name=name))
