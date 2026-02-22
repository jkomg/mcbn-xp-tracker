"""Public player-facing routes. No authentication required."""

from flask import Blueprint, render_template, request, abort, flash, redirect, url_for
from app import sheets_client
from app.models import SPEND_CATEGORIES

bp = Blueprint('player', __name__)


@bp.route('/')
def lookup():
    """Player landing page with character search/select."""
    characters = sheets_client.get_active_characters()
    characters.sort(key=lambda c: c.character_name.lower())
    return render_template('player/lookup.html', characters=characters)


@bp.route('/<name>')
def character(name):
    """Public character XP summary with submission forms."""
    char = sheets_client.get_character(name)
    if not char:
        abort(404)

    claims = sheets_client.get_claims_for_character(name)
    spends = sheets_client.get_spends_for_character(name)

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

    ledger = sheets_client.get_ledger_for_character(name)

    # Compute XP totals (includes ledger)
    xp = sheets_client.get_xp_totals(name)

    # Open periods for claim form dropdown
    all_periods = sheets_client.get_all_periods()
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
        earned_xp=xp['earned_xp'] + xp['ledger_awarded'],
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
def submit_claim(name):
    """Submit an XP claim for a play period."""
    char = sheets_client.get_character(name)
    if not char or not char.active:
        abort(404)

    play_period = request.form.get('play_period', '').strip()
    if not play_period:
        flash('Please select a play period.', 'danger')
        return redirect(url_for('player.character', name=name))

    # Validate period exists and is open
    all_periods = sheets_client.get_all_periods()
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
    # Capture wildcard reason if wildcard was checked
    if 'wildcard' in categories:
        wildcard_reason = request.form.get('wildcard_reason', '').strip()
        if not wildcard_reason:
            flash('Please provide a reason for the wildcard XP claim.', 'danger')
            return redirect(url_for('player.character', name=name))
        categories['wildcard_reason'] = wildcard_reason

    if not categories:
        flash('Please select at least one XP category to claim.', 'danger')
        return redirect(url_for('player.character', name=name))

    if missing_links:
        flash('A Discord post link is required for each claimed category.', 'danger')
        return redirect(url_for('player.character', name=name))

    try:
        sheets_client.submit_xp_claim(name, play_period, categories)
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
def submit_spend(name):
    """Submit a spend request."""
    char = sheets_client.get_character(name)
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

    try:
        xp_cost = sheets_client.submit_spend_request(
            character_name=name,
            spend_category=spend_category,
            trait_name=trait_name,
            current_dots=current_dots,
            new_dots=new_dots,
            is_in_clan=is_in_clan,
            justification=justification,
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
