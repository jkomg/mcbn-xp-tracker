"""Player-facing routes. Requires Discord authentication."""

import csv
import io
from flask import (
    Blueprint, render_template, request, abort, flash, redirect, url_for,
    session, Response,
)
from app import db_service, sheets_sync, limiter
from app.auth import (
    require_login, require_character_owner, is_staff as check_is_staff,
    get_player_discord_id,
)
from app.db import CharacterDraft
from app.models import SPEND_CATEGORIES
from app.game_calendar import get_calendar

bp = Blueprint('player', __name__)

_CSV_INJECTION_PREFIXES = ('=', '+', '-', '@', '\t', '\r')


def _csv_safe(value: str) -> str:
    """Prefix formula-injection characters so Excel/Sheets won't execute them."""
    s = str(value)
    if s and s[0] in _CSV_INJECTION_PREFIXES:
        return "'" + s
    return s


def _limit(rule: str):
    if limiter is None:
        return lambda f: f
    return limiter.limit(rule)


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

    # Pending character drafts (draft / revision_requested only — not submitted/approved)
    pending_drafts = (
        CharacterDraft.query
        .filter_by(player_discord_id=discord_id)
        .filter(CharacterDraft.status.in_(['draft', 'revision_requested']))
        .order_by(CharacterDraft.updated_at.desc())
        .all()
    )

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
            pending_drafts=pending_drafts,
        )

    if not my_chars and not pending_drafts:
        # No linked characters and no drafts — show linking flow
        return redirect(url_for('player.link_character'))

    # Show character list with option to link more
    return render_template(
        'player/my_characters.html',
        my_characters=my_chars,
        all_characters=None,
        show_all=False,
        open_periods=open_periods,
        calendar=calendar,
        pending_drafts=pending_drafts,
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
    amend_claims = [
        c for c in claims if c.status.lower() == 'amend'
    ]
    pending_spends = [
        s for s in spends if s.status.lower() == 'pending'
    ]
    denied_spends = [
        s for s in spends if s.status.lower() == 'denied'
    ]
    pending_spends_list = pending_spends  # passed to template for dependency dropdown

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
    backgrounds = db_service.get_character_backgrounds(name)
    current_night = open_periods[0] if open_periods else None

    return render_template(
        'player/character.html',
        char=char,
        earned_xp=xp['earned_xp'],
        total_xp=xp['total_xp'],
        total_spends=xp['total_spends'] + xp['ledger_spent'],
        available_xp=xp['available_xp'],
        approved_claims=approved_claims,
        approved_spends=approved_spends,
        amend_claims=amend_claims,
        pending_claims_count=len(pending_claims),
        pending_spends_list=pending_spends_list,
        pending_spends_count=len(pending_spends),
        denied_spends=denied_spends,
        ledger=ledger,
        open_periods=open_periods,
        claimed_periods=claimed_periods,
        spend_categories=SPEND_CATEGORIES,
        backgrounds=backgrounds,
        current_night=current_night,
    )


@bp.route('/<name>/backgrounds/set', methods=['POST'])
@require_character_owner
@_limit("20 per minute")
def set_background(name):
    char = db_service.get_character(name)
    if not char or not char.active:
        abort(404)

    background_name = request.form.get('background_name', '').strip()
    try:
        dots_total = int(request.form.get('dots_total', '0') or '0')
    except (ValueError, TypeError):
        dots_total = 0
    dots_total = max(0, min(dots_total, 10))

    actor = f'player:{session.get("discord_name", "unknown")}'
    try:
        result = db_service.set_character_background(name, background_name, dots_total, actor)
        if result.get('deleted'):
            flash(f'Removed background "{result["background"]}".', 'success')
        else:
            flash(f'Updated background "{result["background"]}" to {dots_total} dot(s).', 'success')
        db_service.log_action(
            staff_user=actor,
            action_type='player_background_set',
            target=name,
            details=f'{result["background"]} => {dots_total} dots',
        )
    except ValueError as e:
        flash(str(e), 'danger')

    return redirect(url_for('player.character', name=name))


@bp.route('/<name>/backgrounds/blank', methods=['POST'])
@require_character_owner
@_limit("20 per minute")
def blank_background(name):
    char = db_service.get_character(name)
    if not char or not char.active:
        abort(404)

    background_name = request.form.get('background_name', '').strip()
    try:
        dots = int(request.form.get('dots', '1') or '1')
    except (ValueError, TypeError):
        dots = 1
    dots = max(1, min(dots, 10))

    all_periods = db_service.get_all_periods()
    open_periods = [p for p in all_periods if p.submissions_open and p.active]
    open_periods.sort(key=lambda p: p.night_number, reverse=True)
    current_night = open_periods[0] if open_periods else None
    if not current_night:
        flash('Cannot blank backgrounds without an active night.', 'danger')
        return redirect(url_for('player.character', name=name))

    actor = f'player:{session.get("discord_name", "unknown")}'
    try:
        result = db_service.blank_character_background(
            name,
            background_name,
            dots,
            current_night.night_number,
            actor,
        )
        flash(
            f'Blanked {result["dots_blanked_now"]} dot(s) of {result["background_name"]}. '
            f'Release scheduled for Night {result["release_night_number"]}.',
            'success',
        )
        db_service.log_action(
            staff_user=actor,
            action_type='player_background_blank',
            target=name,
            details=(
                f'{result["background_name"]}: blanked {result["dots_blanked_now"]} dot(s), '
                f'release night {result["release_night_number"]}'
            ),
        )
    except ValueError as e:
        flash(str(e), 'danger')

    return redirect(url_for('player.character', name=name))


@bp.route('/<name>/claim', methods=['POST'])
@require_character_owner
@_limit("10 per minute")
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
        wildcard_reason = request.form.get('wildcard_reason', '').strip()[:500]
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
@_limit("10 per minute")
def submit_spend(name):
    """Submit a spend request."""
    char = db_service.get_character(name)
    if not char or not char.active:
        abort(404)

    spend_category = request.form.get('spend_category', '').strip()
    trait_name = request.form.get('trait_name', '').strip()
    power_name = request.form.get('power_name', '').strip()[:100]
    justification = request.form.get('justification', '').strip()[:1000]

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

    try:
        depends_on = int(request.form.get('depends_on', 0) or 0)
    except (ValueError, TypeError):
        depends_on = 0

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
            power_name=power_name,
            current_dots=current_dots,
            new_dots=new_dots,
            is_in_clan=is_in_clan,
            justification=justification,
            depends_on=depends_on,
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


@bp.route('/<name>/claim/<int:claim_id>/amend', methods=['GET', 'POST'])
@require_character_owner
@_limit("10 per minute")
def amend_claim(name, claim_id):
    """Let a player edit and resubmit a claim that was re-opened for amendment."""
    char = db_service.get_character(name)
    if not char or not char.active:
        abort(404)

    claim = db_service.get_claim_by_row(claim_id)
    if not claim:
        abort(404)

    # Only allow amendment of claims belonging to this character and in Amend status
    if claim.character_name.lower() != name.lower():
        abort(403)
    if claim.status.strip().lower() != 'amend':
        flash('This claim is not open for amendment.', 'warning')
        return redirect(url_for('player.character', name=name))

    if request.method == 'GET':
        return render_template('player/amend_claim.html', char=char, claim=claim)

    # POST: process amended submission
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
    if 'wildcard' in categories:
        wildcard_reason = request.form.get('wildcard_reason', '').strip()[:500]
        if not wildcard_reason:
            flash('Please provide a reason for the wildcard XP claim.', 'danger')
            return redirect(url_for('player.amend_claim', name=name, claim_id=claim_id))
        categories['wildcard_reason'] = wildcard_reason
        wildcard_amount = request.form.get('wildcard_amount', '1').strip()
        try:
            wildcard_amount = max(1, min(10, int(wildcard_amount)))
        except (ValueError, TypeError):
            wildcard_amount = 1
        categories['wildcard_amount'] = str(wildcard_amount)

    if not categories:
        flash('Please select at least one XP category to claim.', 'danger')
        return redirect(url_for('player.amend_claim', name=name, claim_id=claim_id))
    if missing_links:
        flash('A Discord post link is required for each claimed category.', 'danger')
        return redirect(url_for('player.amend_claim', name=name, claim_id=claim_id))

    discord_name = session.get('discord_name', 'unknown')
    db_service.amend_claim(claim_id, categories)
    db_service.log_action(
        staff_user=f'player:{discord_name}',
        action_type='player_claim_amended',
        target=name,
        details=f'Player amended and resubmitted claim for {claim.play_period}',
    )
    if sheets_sync:
        sheets_sync.sync_log_action(
            staff_user=f'player:{discord_name}',
            action_type='player_claim_amended',
            target=name,
            details=f'Player amended and resubmitted claim for {claim.play_period}',
        )
    flash(
        f'Your amended claim for {claim.play_period} has been resubmitted. '
        f'Awaiting staff review.',
        'success',
    )
    return redirect(url_for('player.character', name=name))


@bp.route('/<name>/export.csv')
@require_character_owner
def export_xp_csv(name):
    """Download full XP transaction history as CSV."""
    char = db_service.get_character(name)
    if not char:
        abort(404)

    claims = db_service.get_claims_for_character(name)
    spends = db_service.get_spends_for_character(name)
    ledger = db_service.get_ledger_for_character(name)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(['Type', 'Date', 'Description', 'XP Change', 'Status', 'Notes'])

    for c in sorted(claims, key=lambda x: x.timestamp or ''):
        if c.status.lower() == 'approved':
            writer.writerow([
                'Claim', c.review_date or c.timestamp,
                _csv_safe(f'XP Claim: {c.play_period}'),
                f'+{c.approved_xp}', 'Approved',
                _csv_safe(c.st_notes or ''),
            ])
        elif c.status.lower() == 'denied':
            writer.writerow([
                'Claim', c.review_date or c.timestamp,
                _csv_safe(f'XP Claim: {c.play_period}'),
                '0', 'Denied',
                _csv_safe(c.st_notes or ''),
            ])

    for s in sorted(spends, key=lambda x: x.timestamp or ''):
        if s.status.lower() == 'approved':
            writer.writerow([
                'Spend', s.review_date or s.timestamp,
                _csv_safe(f'{s.spend_category}: {s.trait_name} ({s.current_dots}→{s.new_dots})'),
                f'-{s.verified_cost}', 'Approved',
                _csv_safe(s.st_notes or ''),
            ])
        elif s.status.lower() == 'denied':
            writer.writerow([
                'Spend', s.review_date or s.timestamp,
                _csv_safe(f'{s.spend_category}: {s.trait_name} ({s.current_dots}→{s.new_dots})'),
                '0', 'Denied',
                _csv_safe(s.st_notes or ''),
            ])
        elif s.status.lower() == 'pending':
            writer.writerow([
                'Spend', s.timestamp,
                _csv_safe(f'{s.spend_category}: {s.trait_name} ({s.current_dots}→{s.new_dots})'),
                f'-{s.xp_cost} (pending)', 'Pending',
                '',
            ])

    for e in sorted(ledger, key=lambda x: x.date or ''):
        if e.awarded != 0:
            sign = '+' if e.awarded > 0 else ''
            writer.writerow([
                'Ledger', e.date, _csv_safe(e.reason or 'Manual award'),
                f'{sign}{e.awarded}', 'Applied', '',
            ])
        if e.spent != 0:
            sign = '-' if e.spent > 0 else '+'
            writer.writerow([
                'Ledger', e.date, _csv_safe(e.reason or 'Manual spend'),
                f'{sign}{abs(e.spent)}', 'Applied', '',
            ])

    safe_name = ''.join(c for c in name if c.isalnum() or c in ' _-').strip().replace(' ', '_')
    return Response(
        buf.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': f'attachment; filename="{safe_name}_xp_history.csv"'},
    )
