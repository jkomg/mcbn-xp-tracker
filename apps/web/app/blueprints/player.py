"""Player-facing routes. Requires Discord authentication."""

import csv
import io
import json
import logging
from datetime import datetime, timezone
from flask import (
    Blueprint, render_template, request, abort, flash, redirect, url_for,
    session, Response,
)
from app import db_service, sheets_sync, limiter
from app.auth import (
    require_login, require_character_owner, is_staff as check_is_staff,
    get_player_discord_id,
)
from app.db import AppSetting, CharacterDraft, Coterie, CoterieMember, DbCharacter, db
from app.models import AGE_CATEGORIES, SPEND_CATEGORIES
from app.game_calendar import get_calendar

logger = logging.getLogger(__name__)

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
    has_linked_chars = bool(my_chars)

    # Retired/deceased characters are hidden by default so a player's
    # dashboard doesn't accumulate every character they've ever played.
    # ?show=all reveals them again — nothing is deleted either way.
    show_retired = request.args.get('show') == 'all'
    retired_count = sum(1 for c in my_chars if not c.active)
    if not show_retired:
        my_chars = [c for c in my_chars if c.active]

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

    # Which roster characters have an approved living sheet
    chars_with_sheet: set[str] = set()
    if my_chars:
        char_ids = [
            row.id for row in DbCharacter.query.filter(
                DbCharacter.character_name.in_([c.character_name for c in my_chars])
            ).all()
        ]
        approved_drafts = CharacterDraft.query.filter(
            CharacterDraft.roster_character_id.in_(char_ids),
            CharacterDraft.status == 'approved',
        ).all()
        sheet_id_set = {d.roster_character_id for d in approved_drafts}
        name_map = {
            row.id: row.character_name for row in DbCharacter.query.filter(
                DbCharacter.id.in_(char_ids)
            ).all()
        }
        chars_with_sheet = {name_map[i] for i in sheet_id_set if i in name_map}

    # Staff also see a full character search
    if check_is_staff():
        all_characters = db_service.get_active_characters()
        all_characters.sort(key=lambda c: c.character_name.lower())
        return render_template(
            'player/my_characters.html',
            my_characters=my_chars,
            all_characters=all_characters,
            show_all=True,
            show_retired=show_retired,
            retired_count=retired_count,
            open_periods=open_periods,
            calendar=calendar,
            pending_drafts=pending_drafts,
            chars_with_sheet=chars_with_sheet,
        )

    if not has_linked_chars and not pending_drafts:
        # No linked characters and no drafts — show linking flow
        return redirect(url_for('player.link_character'))

    # Show character list with option to link more
    return render_template(
        'player/my_characters.html',
        my_characters=my_chars,
        all_characters=None,
        show_all=False,
        show_retired=show_retired,
        retired_count=retired_count,
        open_periods=open_periods,
        calendar=calendar,
        pending_drafts=pending_drafts,
        chars_with_sheet=chars_with_sheet,
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
    boons = db_service.get_boons_for_character(name)
    current_night = open_periods[0] if open_periods else None

    # Check whether this character has an approved living sheet draft; load data for spend form
    char_row = DbCharacter.query.filter(
        DbCharacter.character_name.ilike(name)
    ).first()
    has_approved_draft = False
    sheet_data = None
    pending_sheet_review = None
    denied_sheet_review = None
    if char_row:
        approved_draft = CharacterDraft.query.filter_by(
            roster_character_id=char_row.id,
            status='approved',
        ).first()
        if approved_draft:
            has_approved_draft = True
            if approved_draft.character_data:
                try:
                    sheet_data = _normalize_sheet_data(json.loads(approved_draft.character_data))
                except (json.JSONDecodeError, TypeError):
                    sheet_data = None

        pending_sheet_review = CharacterDraft.query.filter_by(
            roster_character_id=char_row.id,
            status='sheet_review',
        ).order_by(CharacterDraft.submitted_at.desc()).first()
        if not pending_sheet_review:
            latest_denied = CharacterDraft.query.filter_by(
                roster_character_id=char_row.id,
                status='denied',
            ).order_by(CharacterDraft.submitted_at.desc()).first()
            # Only surface it if nothing has been approved since — otherwise a
            # denial from before a later, successful re-import would keep
            # showing "your import was denied" forever even after approval.
            if latest_denied and (
                not approved_draft
                or not approved_draft.approved_at
                or not latest_denied.submitted_at
                or latest_denied.submitted_at > approved_draft.approved_at
            ):
                denied_sheet_review = latest_denied

    # Coterie membership for donate-to-coterie spend option and role display
    player_coterie = None
    player_coterie_role = None
    if char_row:
        membership = (
            CoterieMember.query
            .filter_by(roster_character_id=char_row.id)
            .first()
        )
        if membership:
            player_coterie = membership.coterie
            player_coterie_role = membership.role

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
        pending_claims_list=pending_claims,
        pending_claims_count=len(pending_claims),
        pending_spends_list=pending_spends_list,
        pending_spends_count=len(pending_spends),
        denied_spends=denied_spends,
        ledger=ledger,
        open_periods=open_periods,
        claimed_periods=claimed_periods,
        spend_categories=SPEND_CATEGORIES,
        backgrounds=backgrounds,
        boons=boons,
        current_night=current_night,
        has_approved_draft=has_approved_draft,
        sheet_data=sheet_data,
        pending_sheet_review=pending_sheet_review,
        denied_sheet_review=denied_sheet_review,
        chronicle_tenets=_get_chronicle_tenets(),
        player_coterie=player_coterie,
        player_coterie_role=player_coterie_role,
        wish_list_items=db_service.get_wish_list_items(name),
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

    # Donated backgrounds can only be blanked through the coterie page
    from app.db import DbCharacterBackground as _BgModel
    _bg_row = _BgModel.query.filter_by(
        character_name=name,
        background_name=background_name,
    ).first()
    if _bg_row and _bg_row.donated_coterie_id:
        flash(
            'This background is donated to a coterie — blank it from the coterie page.',
            'warning',
        )
        return redirect(url_for('player.character', name=name))

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

    from app.character_sheet import _SUBCATEGORY_ADVANTAGES
    if trait_name.lower() in _SUBCATEGORY_ADVANTAGES and not power_name:
        flash(
            f'{_SUBCATEGORY_ADVANTAGES[trait_name.lower()]} is required for {trait_name} purchases.',
            'danger',
        )
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

    coterie_id: int | None = None
    raw_coterie_id = request.form.get('coterie_id', '').strip()
    if raw_coterie_id:
        try:
            coterie_id = int(raw_coterie_id)
        except (ValueError, TypeError):
            coterie_id = None

    if coterie_id is not None:
        _spend_char_row = DbCharacter.query.filter(
            DbCharacter.character_name.ilike(name)
        ).first()
        valid_membership = (
            CoterieMember.query
            .filter_by(
                roster_character_id=_spend_char_row.id if _spend_char_row else -1,
                coterie_id=coterie_id,
            )
            .join(Coterie, CoterieMember.coterie_id == Coterie.id)
            .filter(Coterie.status == 'active')
            .first()
        ) if _spend_char_row else None
        if not valid_membership:
            coterie_id = None

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
            coterie_id=coterie_id,
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


_WISH_LIST_DEFAULT_JUSTIFICATION = 'Planned via wish list'


@bp.route('/<name>/wishlist/add', methods=['POST'])
@require_character_owner
@_limit("20 per minute")
def add_wish_list_item(name):
    """Add an item to the character's wish list."""
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

    from app.character_sheet import _DISCIPLINE_CATEGORIES, _SUBCATEGORY_ADVANTAGES
    if spend_category in _DISCIPLINE_CATEGORIES and not power_name:
        flash('Power name is required for discipline purchases.', 'danger')
        return redirect(url_for('player.character', name=name))
    if trait_name.lower() in _SUBCATEGORY_ADVANTAGES and not power_name:
        flash(
            f'{_SUBCATEGORY_ADVANTAGES[trait_name.lower()]} is required for {trait_name} purchases.',
            'danger',
        )
        return redirect(url_for('player.character', name=name))

    try:
        current_dots = int(request.form.get('current_dots', 0))
        new_dots = int(request.form.get('new_dots', 1))
    except (ValueError, TypeError):
        flash('Invalid dot values.', 'danger')
        return redirect(url_for('player.character', name=name))

    is_in_clan = bool(request.form.get('is_in_clan'))

    try:
        final_justification = justification or _WISH_LIST_DEFAULT_JUSTIFICATION
        result = db_service.add_wish_list_item(
            character_name=name,
            spend_category=spend_category,
            trait_name=trait_name,
            power_name=power_name,
            current_dots=current_dots,
            new_dots=new_dots,
            is_in_clan=is_in_clan,
            justification=final_justification,
        )
        discord_name = session.get('discord_name', 'unknown')
        db_service.log_action(
            staff_user=f'player:{discord_name}',
            action_type='player_wishlist_add',
            target=name,
            details=f'{spend_category}: {trait_name} ({current_dots}→{new_dots})',
        )
        if sheets_sync:
            sheets_sync.sync_log_action(
                staff_user=f'player:{discord_name}',
                action_type='player_wishlist_add',
                target=name,
                details=f'{spend_category}: {trait_name} ({current_dots}→{new_dots})',
            )
            sheets_sync.sync_add_wish_list_item(
                character_name=name,
                spend_category=spend_category,
                trait_name=trait_name,
                power_name=power_name,
                current_dots=current_dots,
                new_dots=new_dots,
                is_in_clan=is_in_clan,
                xp_cost=result['xp_cost'],
                justification=final_justification,
                created_at=result['created_at'],
            )
        flash(f'Added "{trait_name}" to your wish list.', 'success')
    except ValueError as e:
        flash(f'Could not add to wish list: {e}', 'danger')

    return redirect(url_for('player.character', name=name))


@bp.route('/<name>/wishlist/<int:item_id>/remove', methods=['POST'])
@require_character_owner
@_limit("20 per minute")
def remove_wish_list_item(name, item_id):
    """Remove an item from the character's wish list."""
    char = db_service.get_character(name)
    if not char or not char.active:
        abort(404)

    item = db_service.get_wish_list_item(item_id, name)
    if item and db_service.delete_wish_list_item(item_id, name):
        discord_name = session.get('discord_name', 'unknown')
        db_service.log_action(
            staff_user=f'player:{discord_name}',
            action_type='player_wishlist_remove',
            target=name,
            details=f'{item.spend_category}: {item.trait_name} ({item.current_dots}→{item.new_dots})',
        )
        if sheets_sync:
            sheets_sync.sync_log_action(
                staff_user=f'player:{discord_name}',
                action_type='player_wishlist_remove',
                target=name,
                details=f'{item.spend_category}: {item.trait_name} ({item.current_dots}→{item.new_dots})',
            )
            sheets_sync.sync_remove_wish_list_item(
                character_name=name,
                spend_category=item.spend_category,
                trait_name=item.trait_name,
                current_dots=item.current_dots,
                new_dots=item.new_dots,
            )
        flash('Removed item from wish list.', 'success')
    else:
        flash('Wish list item not found.', 'danger')

    return redirect(url_for('player.character', name=name))


@bp.route('/<name>/wishlist/<int:item_id>/spend', methods=['POST'])
@require_character_owner
@_limit("10 per minute")
def convert_wish_list_item(name, item_id):
    """Convert a wish list item directly into a pending spend request."""
    char = db_service.get_character(name)
    if not char or not char.active:
        abort(404)

    item = db_service.get_wish_list_item(item_id, name)
    if not item:
        flash('Wish list item not found.', 'danger')
        return redirect(url_for('player.character', name=name))

    try:
        discord_name = session.get('discord_name', 'unknown')
        justification = item.justification or _WISH_LIST_DEFAULT_JUSTIFICATION
        xp_cost = db_service.submit_spend_request(
            character_name=name,
            spend_category=item.spend_category,
            trait_name=item.trait_name,
            power_name=item.power_name,
            current_dots=item.current_dots,
            new_dots=item.new_dots,
            is_in_clan=item.is_in_clan,
            justification=justification,
        )
        if sheets_sync:
            sheets_sync.sync_add_spend(
                character_name=name,
                spend_category=item.spend_category,
                trait_name=item.trait_name,
                current_dots=item.current_dots,
                new_dots=item.new_dots,
                is_in_clan=item.is_in_clan,
                justification=justification,
            )
        db_service.log_action(
            staff_user=f'player:{discord_name}',
            action_type='player_spend_submitted',
            target=name,
            details=(
                f'{item.spend_category}: {item.trait_name} '
                f'({item.current_dots}→{item.new_dots}) for {xp_cost} XP (from wish list)'
            ),
        )
        if sheets_sync:
            sheets_sync.sync_log_action(
                staff_user=f'player:{discord_name}',
                action_type='player_spend_submitted',
                target=name,
                details=(
                    f'{item.spend_category}: {item.trait_name} '
                    f'({item.current_dots}→{item.new_dots}) for {xp_cost} XP (from wish list)'
                ),
            )
        db_service.delete_wish_list_item(item_id, name)
        if sheets_sync:
            sheets_sync.sync_remove_wish_list_item(
                character_name=name,
                spend_category=item.spend_category,
                trait_name=item.trait_name,
                current_dots=item.current_dots,
                new_dots=item.new_dots,
            )
        flash(
            f'Spend request submitted: {item.trait_name} '
            f'({item.current_dots}→{item.new_dots}) for {xp_cost} XP. '
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


def _get_chronicle_tenets() -> list[str]:
    row = db.session.get(AppSetting, 'CHRONICLE_TENETS')
    if row and row.value:
        return [t.strip() for t in row.value.splitlines() if t.strip()]
    return []


def _normalize_sheet_data(data: dict) -> dict:
    """Normalize character_data for sheet rendering.

    Unifies the two specialty formats:
    - CC format: skillSpecialties: [{skill, name}, ...]
    - RoD import: skill_specialties: {skill: [name, ...]}

    Unifies the two conviction formats:
    - CC format: convictions embedded on each touchstone as t.conviction
    - RoD import: top-level convictions array

    Always produces skill_specialties (dict) and convictions (list) so
    templates have one format to handle.
    """
    if 'skill_specialties' not in data:
        cc_specs = list(data.get('skillSpecialties') or [])
        predator = data.get('predatorType')
        if isinstance(predator, dict):
            cc_specs = cc_specs + list(predator.get('pickedSpecialties') or [])
        merged: dict[str, list[str]] = {}
        for item in cc_specs:
            if isinstance(item, dict):
                skill = item.get('skill', '').replace(' ', '_')
                name = item.get('name', '').strip()
                if skill and name:
                    merged.setdefault(skill, []).append(name)
        if merged:
            data['skill_specialties'] = merged

    if not data.get('convictions'):
        conv_from_ts = [
            t['conviction']
            for t in (data.get('touchstones') or [])
            if isinstance(t, dict) and t.get('conviction')
        ]
        if conv_from_ts:
            data['convictions'] = conv_from_ts

    return data


# Lowercased app.models.AGE_CATEGORIES (the roster's canonical list, e.g.
# includes 'elder') plus 'ghoul' — a valid CC-approval-flow value
# (cc_admin.draft_approve capitalizes character_data['age_category'] straight
# into DbCharacter.age_category without validating against AGE_CATEGORIES).
# Derived rather than hand-listed so this can't silently drift out of sync
# and re-introduce the same "unrecognized category falls back to ancilla"
# bug this allowlist exists to prevent.
_ROSTER_AGE_CATEGORIES = frozenset({c.lower() for c in AGE_CATEGORIES} | {'ghoul'})


def _map_rod_to_cc(rod: dict, age_category: str = 'ancilla') -> dict:
    """Map a Realm of Darkness V5 sheet export to CC character_data format.

    *age_category* should be the character's actual roster age category
    (one of _ROSTER_AGE_CATEGORIES); defaults to 'ancilla' only when the
    caller has nothing better (e.g. roster age_category is blank/unrecognized).
    """
    # Basic identity fields
    data: dict = {
        'name': rod.get('name', ''),
        'clan': rod.get('clan', ''),
        'generation': rod.get('generation', 13),
        'predatorType': rod.get('predator_type', ''),
        'bloodPotency': rod.get('blood_potency', 0),
        'humanity': rod.get('humanity', 7),
        'ambition': rod.get('ambition', ''),
        'desire': rod.get('desire', ''),
        'touchstones': (
            [t.strip() for t in rod['touchstones'].split('\n\n') if t.strip()]
            if isinstance(rod.get('touchstones'), str)
            else (rod.get('touchstones') or [])
        ),
        'convictions': (
            [c.strip() for c in rod['convictions'].split('\n\n') if c.strip()]
            if isinstance(rod.get('convictions'), str)
            else [
                (c if isinstance(c, str) else c.get('description', c.get('name', '')))
                for c in (rod.get('convictions') or [])
                if c
            ]
        ),
        'age_category': age_category if age_category in _ROSTER_AGE_CATEGORIES else 'ancilla',
    }

    # Attributes (RoD already uses a flat dict)
    data['attributes'] = dict(rod.get('attributes', {}))

    # Skills: RoD uses {skill: {value: n, spec: [...]}} — flatten to {skill: n}
    # and preserve specialties as {skill: [spec, ...]}
    data['skills'] = {
        k: (v.get('value', 0) if isinstance(v, dict) else int(v or 0))
        for k, v in rod.get('skills', {}).items()
    }
    data['skill_specialties'] = {
        k: v.get('spec') or []
        for k, v in rod.get('skills', {}).items()
        if isinstance(v, dict) and v.get('spec')
    }

    # Disciplines: RoD dict-of-disciplines → CC array of power objects
    cc_disciplines = []
    for disc_key, disc_data in (rod.get('disciplines') or {}).items():
        if not isinstance(disc_data, dict):
            continue
        disc_display = disc_data.get('name', disc_key)
        for level_str, power_data in (disc_data.get('powers') or {}).items():
            if power_data is None:
                continue
            try:
                level = int(level_str)
            except (ValueError, TypeError):
                continue
            cc_disciplines.append({
                'name': power_data.get('name', ''),
                'discipline': disc_display.lower(),
                'level': level,
                'summary': power_data.get('description', ''),
                'rouseChecks': 1,
            })
    data['disciplines'] = cc_disciplines

    def _map_adv(item: dict) -> dict:
        return {
            'name': item.get('name', ''),
            'level': item.get('rating', 0),
            'summary': (item.get('description') or item.get('notes') or ''),
            'excludes': [],
            'type': 'merit',
        }

    data['merits'] = [_map_adv(m) for m in (rod.get('merits') or [])]
    data['backgrounds'] = [_map_adv(b) for b in (rod.get('backgrounds') or [])]
    data['flaws'] = [_map_adv(f) for f in (rod.get('flaws') or [])]

    # Loresheets
    data['loresheet_purchases'] = [
        {
            'loresheet_id': ls.get('name', ''),
            'name': ls.get('name', ''),
            'dot': ls.get('rating', 1),
            'st_approved': False,
        }
        for ls in (rod.get('loresheets') or [])
    ]

    # Willpower / Health totals
    wp = rod.get('willpower', {})
    data['willpower'] = wp.get('total', 6) if isinstance(wp, dict) else 6
    hp = rod.get('health', {})
    data['maxHealth'] = hp.get('total', 7) if isinstance(hp, dict) else 7

    return data


@bp.route('/<name>/import-sheet', methods=['GET', 'POST'])
@require_character_owner
@_limit("5 per minute")
def import_sheet(name):
    """Let a player import a Realm of Darkness JSON export as their living character sheet."""
    char = db_service.get_character(name)
    if not char:
        abort(404)

    char_row = DbCharacter.query.filter(DbCharacter.character_name.ilike(name)).first()
    if not char_row:
        abort(404)

    existing = CharacterDraft.query.filter_by(
        roster_character_id=char_row.id,
        status='approved',
    ).first()

    if request.method == 'GET':
        return render_template('player/import_sheet.html', char=char, has_sheet=existing is not None)

    json_text = request.form.get('sheet_json', '').strip()
    if not json_text:
        flash('Please paste your character sheet JSON.', 'danger')
        return render_template('player/import_sheet.html', char=char)

    try:
        rod_data = json.loads(json_text)
    except json.JSONDecodeError:
        flash('Invalid JSON — please copy the exact output from the /sheet export command.', 'danger')
        return render_template('player/import_sheet.html', char=char)

    if not isinstance(rod_data, dict) or 'attributes' not in rod_data:
        flash('This does not look like a V5 character sheet export. Make sure you copied the full JSON.', 'danger')
        return render_template('player/import_sheet.html', char=char)

    try:
        age_category = (char_row.age_category or '').strip().lower()
        cc_data = _map_rod_to_cc(rod_data, age_category=age_category)
    except Exception as exc:
        logger.warning('RoD sheet import mapping error for %s: %s', name, exc)
        flash('Could not parse the sheet data. Please contact staff for help.', 'danger')
        return render_template('player/import_sheet.html', char=char)

    discord_id = get_player_discord_id()
    discord_name = session.get('discord_name', 'unknown')
    now = datetime.now(timezone.utc)

    # A fresh submission replaces any prior one still awaiting review, so the
    # staff queue and the player's "pending" banner always reflect the latest.
    CharacterDraft.query.filter_by(
        roster_character_id=char_row.id,
        status='sheet_review',
    ).update({'status': 'superseded'})

    draft = CharacterDraft(
        player_discord_id=discord_id,
        character_name=char_row.character_name,
        status='sheet_review',
        roster_character_id=char_row.id,
        character_data=json.dumps(cc_data),
        submitted_at=now,
    )
    db.session.add(draft)
    if existing:
        action_details = 'Re-submitted character sheet from Realm of Darkness export for staff review'
        flash_msg = (
            'Character sheet submitted for staff review. Your current sheet stays active until it\'s approved.'
        )
    else:
        action_details = 'Submitted character sheet from Realm of Darkness export for staff review'
        flash_msg = (
            'Character sheet submitted for staff review — '
            'staff will approve it before it becomes your living sheet.'
        )

    db_service.log_action(
        staff_user=f'player:{discord_name}',
        action_type='player_sheet_import',
        target=name,
        details=action_details,
    )
    db.session.commit()

    flash(flash_msg, 'success')
    return redirect(url_for('player.character', name=name))


@bp.route('/<name>/sheet')
@require_character_owner
def view_sheet(name):
    """Display the player's living character sheet."""
    char = db_service.get_character(name)
    if not char:
        abort(404)

    char_row = DbCharacter.query.filter(DbCharacter.character_name.ilike(name)).first()
    sheet_data = None
    draft = None
    if char_row:
        draft = CharacterDraft.query.filter_by(
            roster_character_id=char_row.id,
            status='approved',
        ).first()
        if draft and draft.character_data:
            try:
                sheet_data = _normalize_sheet_data(json.loads(draft.character_data))
            except (json.JSONDecodeError, TypeError):
                sheet_data = None

    return render_template('player/sheet.html', char=char, sheet_data=sheet_data, draft=draft,
                           chronicle_tenets=_get_chronicle_tenets())
