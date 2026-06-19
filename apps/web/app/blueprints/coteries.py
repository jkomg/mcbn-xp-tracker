"""Coterie management routes — creation, setup, public view, and blanking."""

import logging
import re
from datetime import datetime, timezone

from flask import (
    Blueprint, render_template, request, redirect, url_for, flash, abort,
)

from app.auth import require_staff, require_login, get_player_discord_id, is_staff, is_logged_in
from app.db import (
    db, Coterie, CoterieMember, CoterieAdvantage,
    DbCharacter, DbCharacterBackground, DbSpendRequest,
)
from app.db_service import DBService

# Creation-phase limits (V5 house rules)
_CREATION_DOMAIN_MAX = 3   # max dots in any single domain rating at creation
_CREATION_FLAW_MAX = 4     # max flaw dots (each grants +1 Advantage/Background dot)
_CREATION_DOTS_PER_MEMBER = 2  # free dots each member contributes at formation

logger = logging.getLogger(__name__)

bp = Blueprint('coteries', __name__)
db_service = DBService()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'-+', '-', slug).strip('-')
    return slug or 'coterie'


def _get_coterie_or_404(slug: str) -> Coterie:
    coterie = Coterie.query.filter_by(slug=slug).first()
    if not coterie:
        abort(404)
    return coterie


def _get_player_character(discord_id: str) -> DbCharacter | None:
    """Return the active approved character for this Discord user, if any."""
    return DbCharacter.query.filter_by(
        player_discord=discord_id,
        active=True,
    ).first()


def _get_coterie_member(coterie: Coterie, char: DbCharacter) -> CoterieMember | None:
    return CoterieMember.query.filter_by(
        coterie_id=coterie.id,
        roster_character_id=char.id,
    ).first()


# ---------------------------------------------------------------------------
# Public: coterie index
# ---------------------------------------------------------------------------

@bp.route('/')
def index():
    coteries = Coterie.query.filter(
        Coterie.status.in_(['active', 'pending'])
    ).order_by(Coterie.name).all()
    return render_template('coteries/index.html', coteries=coteries)


# ---------------------------------------------------------------------------
# Public: coterie page
# ---------------------------------------------------------------------------

@bp.route('/<slug>')
def view(slug: str):
    coterie = _get_coterie_or_404(slug)

    # Donated backgrounds: from member PCs, grouped by character
    donated_bgs = DbCharacterBackground.query.filter_by(
        donated_coterie_id=coterie.id
    ).all()

    # Determine if the current player is a member (for blanking controls)
    is_member = False
    player_char = None
    my_backgrounds = []
    my_pending = []
    if is_logged_in():
        discord_id = get_player_discord_id()
        player_char = _get_player_character(discord_id)
        if player_char:
            is_member = bool(_get_coterie_member(coterie, player_char))
            # Backgrounds the player can donate (not already donated or pending anywhere)
            my_backgrounds = DbCharacterBackground.query.filter_by(
                character_name=player_char.character_name,
                donated_coterie_id=None,
                donation_pending_coterie_id=None,
            ).filter(DbCharacterBackground.dots_total > 0).all()
            # Backgrounds this player has pending for this coterie
            my_pending = DbCharacterBackground.query.filter_by(
                character_name=player_char.character_name,
                donation_pending_coterie_id=coterie.id,
            ).all()
        else:
            my_pending = []

    # Pool items: hide creation-tagged entries from the pool only while forming
    # (they appear in the formation panel instead); once submitted/active they join the pool
    forming = _is_forming(coterie)
    public_advantages = [
        a for a in coterie.advantages
        if not (forming and a.notes == '__creation__')
    ]
    pool_backgrounds = [a for a in public_advantages if a.advantage_type == 'background']
    pool_merits = [a for a in public_advantages if a.advantage_type == 'merit']
    pool_flaws = [a for a in public_advantages if a.advantage_type == 'flaw']

    # XP donations: approved spends flagged for this coterie
    from sqlalchemy import func as _func
    xp_donations = DbSpendRequest.query.filter(
        DbSpendRequest.coterie_id == coterie.id,
        _func.lower(DbSpendRequest.status) == 'approved',
    ).order_by(DbSpendRequest.review_date.desc()).all()
    xp_donations_total = sum(s.verified_cost or 0 for s in xp_donations)

    # Pending XP donations (submitted but not yet approved)
    pending_xp_donations = DbSpendRequest.query.filter(
        DbSpendRequest.coterie_id == coterie.id,
        _func.lower(DbSpendRequest.status) == 'pending',
    ).order_by(DbSpendRequest.timestamp.desc()).all()

    return render_template(
        'coteries/view.html',
        coterie=coterie,
        donated_bgs=donated_bgs,
        pool_backgrounds=pool_backgrounds,
        pool_merits=pool_merits,
        pool_flaws=pool_flaws,
        is_member=is_member,
        player_char=player_char,
        my_backgrounds=my_backgrounds,
        my_pending=my_pending,
        is_staff_user=is_staff(),
        is_forming=forming,
        xp_donations=xp_donations,
        xp_donations_total=xp_donations_total,
        pending_xp_donations=pending_xp_donations,
    )


# ---------------------------------------------------------------------------
# Staff: create coterie
# ---------------------------------------------------------------------------

@bp.route('/new', methods=['GET', 'POST'])
@require_staff
def new():
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        description = request.form.get('description', '').strip()
        channel_id = request.form.get('discord_channel_id', '').strip() or None

        if not name:
            flash('Coterie name is required.', 'danger')
            return render_template('coteries/new.html')

        slug = _slugify(name)
        # Ensure slug uniqueness
        base_slug = slug
        counter = 1
        while Coterie.query.filter_by(slug=slug).first():
            slug = f'{base_slug}-{counter}'
            counter += 1

        if Coterie.query.filter_by(name=name).first():
            flash(f'A coterie named "{name}" already exists.', 'danger')
            return render_template('coteries/new.html')

        now = datetime.now(timezone.utc)
        coterie = Coterie(
            name=name,
            slug=slug,
            description=description,
            discord_channel_id=channel_id,
            status='pending',
            created_at=now,
            updated_at=now,
        )
        db.session.add(coterie)
        db.session.commit()
        flash(f'Coterie "{name}" created.', 'success')
        return redirect(url_for('coteries.manage', slug=coterie.slug))

    return render_template('coteries/new.html')


# ---------------------------------------------------------------------------
# Staff: manage coterie (members + advantages)
# ---------------------------------------------------------------------------

@bp.route('/<slug>/manage')
@require_staff
def manage(slug: str):
    coterie = _get_coterie_or_404(slug)
    existing_ids = [m.roster_character_id for m in coterie.members]
    available_chars = DbCharacter.query.filter(
        DbCharacter.active,
        ~DbCharacter.id.in_(existing_ids) if existing_ids else True,
    ).order_by(DbCharacter.character_name).all()

    pending_donations = DbCharacterBackground.query.filter_by(
        donation_pending_coterie_id=coterie.id,
    ).order_by(DbCharacterBackground.character_name, DbCharacterBackground.background_name).all()

    return render_template(
        'coteries/manage.html',
        coterie=coterie,
        available_chars=available_chars,
        pending_donations=pending_donations,
    )


@bp.route('/<slug>/members', methods=['POST'])
@require_staff
def add_member(slug: str):
    coterie = _get_coterie_or_404(slug)
    char_id = request.form.get('character_id', type=int)
    char = DbCharacter.query.get(char_id)
    if not char:
        flash('Character not found.', 'danger')
        return redirect(url_for('coteries.manage', slug=slug))

    # One character per coterie per player enforced by DB unique constraint
    if CoterieMember.query.filter_by(coterie_id=coterie.id, roster_character_id=char.id).first():
        flash(f'{char.character_name} is already a member.', 'warning')
        return redirect(url_for('coteries.manage', slug=slug))

    member = CoterieMember(
        coterie_id=coterie.id,
        roster_character_id=char.id,
        free_dots_remaining=2,
        setup_complete=False,
        joined_at=datetime.now(timezone.utc),
    )
    db.session.add(member)
    db.session.commit()
    flash(f'{char.character_name} added to {coterie.name}.', 'success')
    return redirect(url_for('coteries.manage', slug=slug))


@bp.route('/<slug>/members/<int:member_id>/remove', methods=['POST'])
@require_staff
def remove_member(slug: str, member_id: int):
    coterie = _get_coterie_or_404(slug)
    member = CoterieMember.query.filter_by(id=member_id, coterie_id=coterie.id).first_or_404()
    char_name = member.character.character_name

    # Un-donate any backgrounds donated by this character to this coterie
    DbCharacterBackground.query.filter_by(
        character_name=char_name,
        donated_coterie_id=coterie.id,
    ).update({'donated_coterie_id': None, 'dots_blanked': 0})
    # Cancel any pending donation requests too
    DbCharacterBackground.query.filter_by(
        character_name=char_name,
        donation_pending_coterie_id=coterie.id,
    ).update({'donation_pending_coterie_id': None})

    db.session.delete(member)
    db.session.commit()
    flash(f'{char_name} removed from {coterie.name}.', 'success')
    return redirect(url_for('coteries.manage', slug=slug))


@bp.route('/<slug>/activate', methods=['POST'])
@require_staff
def activate(slug: str):
    coterie = _get_coterie_or_404(slug)
    coterie.status = 'active'
    coterie.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    flash(f'{coterie.name} is now active.', 'success')
    return redirect(url_for('coteries.manage', slug=slug))


@bp.route('/<slug>/edit', methods=['POST'])
@require_staff
def edit(slug: str):
    coterie = _get_coterie_or_404(slug)
    coterie.description = request.form.get('description', '').strip()
    channel_id = request.form.get('discord_channel_id', '').strip()
    if channel_id:
        coterie.discord_channel_id = channel_id
    coterie.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    flash('Coterie updated.', 'success')
    return redirect(url_for('coteries.manage', slug=slug))


@bp.route('/<slug>/domain', methods=['POST'])
@require_staff
def update_domain(slug: str):
    """Staff: set Chasse / Lien / Portillon ratings."""
    coterie = _get_coterie_or_404(slug)
    coterie.chasse = max(0, min(5, request.form.get('chasse', 0, type=int)))
    coterie.lien = max(0, min(5, request.form.get('lien', 0, type=int)))
    coterie.portillon = max(0, min(5, request.form.get('portillon', 0, type=int)))
    coterie.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    flash('Domain ratings updated.', 'success')
    return redirect(url_for('coteries.manage', slug=slug))


# ---------------------------------------------------------------------------
# Staff/member: add pool advantage
# ---------------------------------------------------------------------------

@bp.route('/<slug>/advantages', methods=['POST'])
@require_login
def add_advantage(slug: str):
    coterie = _get_coterie_or_404(slug)

    discord_id = get_player_discord_id()
    player_char = _get_player_character(discord_id)

    # Must be a member or staff
    is_member_flag = player_char and bool(_get_coterie_member(coterie, player_char))
    if not is_member_flag and not is_staff():
        abort(403)

    name = request.form.get('name', '').strip()
    dots = request.form.get('dots', 1, type=int)
    advantage_type = request.form.get('advantage_type', 'background')
    notes = request.form.get('notes', '').strip()

    if not name:
        flash('Advantage name is required.', 'danger')
        return redirect(url_for('coteries.view', slug=slug))

    if dots < 1:
        flash('Dots must be at least 1.', 'danger')
        return redirect(url_for('coteries.view', slug=slug))

    if advantage_type not in ('background', 'merit', 'flaw'):
        advantage_type = 'background'

    # Spending from member's free dot allocation (flaws add dots, don't spend them)
    if advantage_type != 'flaw' and is_member_flag and not is_staff():
        member = _get_coterie_member(coterie, player_char)
        if member.free_dots_remaining < dots:
            flash(
                f'You only have {member.free_dots_remaining} free dot(s) remaining.',
                'danger',
            )
            return redirect(url_for('coteries.view', slug=slug))
        member.free_dots_remaining -= dots

    adv = CoterieAdvantage(
        coterie_id=coterie.id,
        name=name,
        dots=dots,
        advantage_type=advantage_type,
        notes=notes,
        added_by=player_char.character_name if player_char else 'staff',
        created_at=datetime.now(timezone.utc),
    )
    db.session.add(adv)
    coterie.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    flash(f'Added {name} ({dots} dot{"s" if dots != 1 else ""}) to {coterie.name}.', 'success')
    return redirect(url_for('coteries.view', slug=slug))


@bp.route('/<slug>/advantages/<int:adv_id>/remove', methods=['POST'])
@require_staff
def remove_advantage(slug: str, adv_id: int):
    coterie = _get_coterie_or_404(slug)
    adv = CoterieAdvantage.query.filter_by(id=adv_id, coterie_id=coterie.id).first_or_404()
    db.session.delete(adv)
    coterie.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    flash(f'Removed {adv.name} from pool.', 'success')
    return redirect(url_for('coteries.view', slug=slug))


# ---------------------------------------------------------------------------
# Member: donate / un-donate background
# ---------------------------------------------------------------------------

@bp.route('/<slug>/donate/<int:bg_id>', methods=['POST'])
@require_login
def donate_background(slug: str, bg_id: int):
    """Player submits a background donation request — pending staff approval."""
    coterie = _get_coterie_or_404(slug)
    discord_id = get_player_discord_id()
    player_char = _get_player_character(discord_id)

    if not player_char or not _get_coterie_member(coterie, player_char):
        abort(403)

    bg = DbCharacterBackground.query.filter_by(
        id=bg_id,
        character_name=player_char.character_name,
    ).first_or_404()

    if bg.donated_coterie_id:
        flash(f'{bg.background_name} is already donated to a coterie.', 'warning')
        return redirect(url_for('coteries.view', slug=slug))

    if bg.donation_pending_coterie_id:
        flash(f'{bg.background_name} already has a pending donation request.', 'warning')
        return redirect(url_for('coteries.view', slug=slug))

    bg.donation_pending_coterie_id = coterie.id
    coterie.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    flash(
        f'Donation request for {bg.background_name} submitted — awaiting staff approval.',
        'success',
    )
    return redirect(url_for('coteries.view', slug=slug))


@bp.route('/<slug>/donate/<int:bg_id>/cancel', methods=['POST'])
@require_login
def cancel_donation(slug: str, bg_id: int):
    """Player cancels their own pending donation request."""
    coterie = _get_coterie_or_404(slug)
    discord_id = get_player_discord_id()
    player_char = _get_player_character(discord_id)

    if not player_char or not _get_coterie_member(coterie, player_char):
        abort(403)

    bg = DbCharacterBackground.query.filter_by(
        id=bg_id,
        character_name=player_char.character_name,
        donation_pending_coterie_id=coterie.id,
    ).first_or_404()

    bg.donation_pending_coterie_id = None
    db.session.commit()
    flash(f'Donation request for {bg.background_name} cancelled.', 'info')
    return redirect(url_for('coteries.view', slug=slug))


@bp.route('/<slug>/donate/<int:bg_id>/approve', methods=['POST'])
@require_staff
def approve_donation(slug: str, bg_id: int):
    """Staff approves a pending background donation."""
    coterie = _get_coterie_or_404(slug)

    bg = DbCharacterBackground.query.filter_by(
        id=bg_id,
        donation_pending_coterie_id=coterie.id,
    ).first_or_404()

    bg.donated_coterie_id = coterie.id
    bg.donation_pending_coterie_id = None
    bg.dots_blanked = bg.dots_total

    notes = request.form.get('flaw_notes', '').strip()
    if notes:
        flaw_adv = CoterieAdvantage(
            coterie_id=coterie.id,
            name=f'{bg.background_name} flaw(s)',
            dots=0,
            advantage_type='flaw',
            notes=notes,
            added_by='staff',
            created_at=datetime.now(timezone.utc),
        )
        db.session.add(flaw_adv)

    coterie.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    flash(f'{bg.background_name} ({bg.character_name}) approved and added to {coterie.name}.', 'success')
    return redirect(url_for('coteries.manage', slug=slug))


@bp.route('/<slug>/donate/<int:bg_id>/deny', methods=['POST'])
@require_staff
def deny_donation(slug: str, bg_id: int):
    """Staff denies a pending background donation."""
    coterie = _get_coterie_or_404(slug)

    bg = DbCharacterBackground.query.filter_by(
        id=bg_id,
        donation_pending_coterie_id=coterie.id,
    ).first_or_404()

    bg.donation_pending_coterie_id = None
    db.session.commit()
    flash(f'Donation request for {bg.background_name} ({bg.character_name}) denied.', 'info')
    return redirect(url_for('coteries.manage', slug=slug))


@bp.route('/<slug>/undonate/<int:bg_id>', methods=['POST'])
@require_login
def undonate_background(slug: str, bg_id: int):
    coterie = _get_coterie_or_404(slug)
    discord_id = get_player_discord_id()
    player_char = _get_player_character(discord_id)

    if not player_char or not _get_coterie_member(coterie, player_char):
        abort(403)

    bg = DbCharacterBackground.query.filter_by(
        id=bg_id,
        character_name=player_char.character_name,
        donated_coterie_id=coterie.id,
    ).first_or_404()

    bg.donated_coterie_id = None
    bg.dots_blanked = 0
    coterie.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    flash(f'{bg.background_name} removed from coterie pool.', 'success')
    return redirect(url_for('coteries.view', slug=slug))


# ---------------------------------------------------------------------------
# Member: blank a donated background
# ---------------------------------------------------------------------------

@bp.route('/<slug>/blank/<int:bg_id>', methods=['POST'])
@require_login
def blank_donated_background(slug: str, bg_id: int):
    coterie = _get_coterie_or_404(slug)
    discord_id = get_player_discord_id()
    player_char = _get_player_character(discord_id)

    if not player_char or not _get_coterie_member(coterie, player_char):
        abort(403)

    bg = DbCharacterBackground.query.filter_by(
        id=bg_id,
        donated_coterie_id=coterie.id,
    ).first_or_404()

    dots = request.form.get('dots', 1, type=int)

    # Find current night
    from app.db import DbPlayPeriod
    open_periods = DbPlayPeriod.query.filter_by(submissions_open=True, active=True).all()
    open_periods.sort(key=lambda p: p.night_number, reverse=True)
    current_night = open_periods[0] if open_periods else None

    if not current_night:
        flash('Cannot blank without an active night.', 'danger')
        return redirect(url_for('coteries.view', slug=slug))

    try:
        result = db_service.blank_character_background(
            bg.character_name,
            bg.background_name,
            dots,
            current_night.night_number,
            updated_by=player_char.character_name,
        )
        release = result['release_night_number']
        flash(
            f'Blanked {result["dots_blanked_now"]} dot(s) of {result["background_name"]} '
            f'(owned by {bg.character_name}). Releases at Night {release}.',
            'success',
        )
    except ValueError as exc:
        flash(str(exc), 'danger')

    return redirect(url_for('coteries.view', slug=slug))

# ---------------------------------------------------------------------------
# Player: propose a new coterie
# ---------------------------------------------------------------------------

@bp.route('/propose', methods=['GET', 'POST'])
@require_login
def propose():
    discord_id = get_player_discord_id()
    player_char = _get_player_character(discord_id)

    if not player_char:
        flash('You need an active character to propose a coterie.', 'danger')
        return redirect(url_for('coteries.index'))

    # A character can only be in one coterie at a time
    existing = CoterieMember.query.filter_by(roster_character_id=player_char.id).first()
    if existing:
        flash('Your character is already in a coterie.', 'warning')
        return redirect(url_for('coteries.view', slug=existing.coterie.slug))

    # Characters eligible to invite (active, approved, not already in a coterie)
    already_in = db.session.query(CoterieMember.roster_character_id).subquery()
    invitable = DbCharacter.query.filter(
        DbCharacter.active,
        DbCharacter.id != player_char.id,
        ~DbCharacter.id.in_(already_in),
    ).order_by(DbCharacter.character_name).all()

    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        description = request.form.get('description', '').strip()
        invite_ids = request.form.getlist('invite_ids', type=int)

        if not name:
            flash('Coterie name is required.', 'danger')
            return render_template('coteries/propose.html', player_char=player_char, invitable=invitable)

        if Coterie.query.filter_by(name=name).first():
            flash(f'A coterie named "{name}" already exists.', 'danger')
            return render_template('coteries/propose.html', player_char=player_char, invitable=invitable)

        slug = _slugify(name)
        base_slug = slug
        counter = 1
        while Coterie.query.filter_by(slug=slug).first():
            slug = f'{base_slug}-{counter}'
            counter += 1

        now = datetime.now(timezone.utc)
        coterie = Coterie(
            name=name,
            slug=slug,
            description=description,
            status='pending',
            creation_state='forming',
            created_at=now,
            updated_at=now,
        )
        db.session.add(coterie)
        db.session.flush()  # get coterie.id

        # Add proposer as leader
        db.session.add(CoterieMember(
            coterie_id=coterie.id,
            roster_character_id=player_char.id,
            free_dots_remaining=_CREATION_DOTS_PER_MEMBER,
            role='leader',
            joined_at=now,
        ))

        # Add invited members
        invited_chars = DbCharacter.query.filter(
            DbCharacter.id.in_(invite_ids),
            DbCharacter.active,
        ).all()
        for char in invited_chars:
            # Skip anyone already in a coterie
            if CoterieMember.query.filter_by(roster_character_id=char.id).first():
                continue
            db.session.add(CoterieMember(
                coterie_id=coterie.id,
                roster_character_id=char.id,
                free_dots_remaining=_CREATION_DOTS_PER_MEMBER,
                role='member',
                joined_at=now,
            ))

        db.session.commit()
        flash(f'Coterie "{name}" proposed! Allocate your creation dots below.', 'success')
        return redirect(url_for('coteries.view', slug=coterie.slug))

    return render_template('coteries/propose.html', player_char=player_char, invitable=invitable)


# ---------------------------------------------------------------------------
# Member: allocate creation dots (forming phase only)
# ---------------------------------------------------------------------------

def _is_forming(coterie: Coterie) -> bool:
    return coterie.creation_state == 'forming'


def _creation_flaw_dots(coterie: Coterie) -> int:
    return sum(a.dots for a in coterie.advantages if a.advantage_type == 'flaw' and a.notes == '__creation__')


def _creation_budget(coterie: Coterie) -> dict:
    base = len(coterie.members) * _CREATION_DOTS_PER_MEMBER
    bonus = _creation_flaw_dots(coterie)
    used_dots = max(0, base - sum(m.free_dots_remaining for m in coterie.members) + bonus)
    return {
        'base': base,
        'bonus': bonus,
        'total': base + bonus,
        'used': used_dots,
        'left': max(0, base + bonus - used_dots),
    }


@bp.route('/<slug>/creation/allocate', methods=['POST'])
@require_login
def creation_allocate(slug: str):
    """Member allocates a free creation dot toward domain or a named trait."""
    coterie = _get_coterie_or_404(slug)

    if not _is_forming(coterie):
        flash('This coterie is not in the formation phase.', 'danger')
        return redirect(url_for('coteries.view', slug=slug))

    discord_id = get_player_discord_id()
    player_char = _get_player_character(discord_id)
    if not player_char or not _get_coterie_member(coterie, player_char):
        abort(403)

    target_kind = request.form.get('target_kind', '')
    target_name = request.form.get('target_name', '').strip()
    dots = request.form.get('dots', 1, type=int)

    if dots < 1:
        flash('Must allocate at least 1 dot.', 'danger')
        return redirect(url_for('coteries.view', slug=slug))

    # Check pool budget
    budget = _creation_budget(coterie)
    if dots > budget['left']:
        flash(f'Only {budget["left"]} creation dot(s) remaining.', 'danger')
        return redirect(url_for('coteries.view', slug=slug))

    if target_kind in ('chasse', 'lien', 'portillon'):
        current = getattr(coterie, target_kind)
        if current + dots > _CREATION_DOMAIN_MAX:
            flash(f'{target_kind.title()} cannot exceed {_CREATION_DOMAIN_MAX} at creation.', 'danger')
            return redirect(url_for('coteries.view', slug=slug))
        setattr(coterie, target_kind, current + dots)

    elif target_kind in ('background', 'merit'):
        if not target_name:
            flash('Trait name is required.', 'danger')
            return redirect(url_for('coteries.view', slug=slug))
        adv = CoterieAdvantage(
            coterie_id=coterie.id,
            name=target_name,
            dots=dots,
            advantage_type=target_kind,
            notes='__creation__',
            added_by=player_char.character_name,
            created_at=datetime.now(timezone.utc),
        )
        db.session.add(adv)

    else:
        flash('Invalid target type.', 'danger')
        return redirect(url_for('coteries.view', slug=slug))

    # Deduct from member's free dot pool (distribute proportionally — simplest: deduct from current user)
    member = _get_coterie_member(coterie, player_char)
    if member.free_dots_remaining >= dots:
        member.free_dots_remaining -= dots
    else:
        # Deduct from pool collectively (other members' remaining dots)
        remaining = dots - member.free_dots_remaining
        member.free_dots_remaining = 0
        for m in coterie.members:
            if m.id == member.id:
                continue
            take = min(m.free_dots_remaining, remaining)
            m.free_dots_remaining -= take
            remaining -= take
            if remaining <= 0:
                break

    coterie.updated_at = datetime.now(timezone.utc)
    db.session.commit()

    label = target_kind.title() if target_kind in ('chasse', 'lien', 'portillon') else target_name
    flash(f'Allocated {dots} dot(s) to {label}.', 'success')
    return redirect(url_for('coteries.view', slug=slug))


@bp.route('/<slug>/creation/flaw', methods=['POST'])
@require_login
def creation_flaw(slug: str):
    """Member takes a coterie flaw during formation, granting bonus creation dots."""
    coterie = _get_coterie_or_404(slug)

    if not _is_forming(coterie):
        flash('This coterie is not in the formation phase.', 'danger')
        return redirect(url_for('coteries.view', slug=slug))

    discord_id = get_player_discord_id()
    player_char = _get_player_character(discord_id)
    if not player_char or not _get_coterie_member(coterie, player_char):
        abort(403)

    flaw_name = request.form.get('flaw_name', '').strip()
    dots = request.form.get('dots', 1, type=int)

    if not flaw_name:
        flash('Flaw name is required.', 'danger')
        return redirect(url_for('coteries.view', slug=slug))

    current_flaw_dots = _creation_flaw_dots(coterie)
    if current_flaw_dots + dots > _CREATION_FLAW_MAX:
        flash(f'Maximum {_CREATION_FLAW_MAX} flaw dots allowed at creation.', 'danger')
        return redirect(url_for('coteries.view', slug=slug))

    # Create flaw entry (tagged __creation__ so we know it's from formation)
    flaw = CoterieAdvantage(
        coterie_id=coterie.id,
        name=flaw_name,
        dots=dots,
        advantage_type='flaw',
        notes='__creation__',
        added_by=player_char.character_name,
        created_at=datetime.now(timezone.utc),
    )
    db.session.add(flaw)

    # Grant bonus dots back to pool — add to the proposer/current member
    member = _get_coterie_member(coterie, player_char)
    member.free_dots_remaining += dots

    coterie.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    flash(f'Took flaw "{flaw_name}" ({dots} dot(s)) — gained {dots} bonus creation dot(s).', 'success')
    return redirect(url_for('coteries.view', slug=slug))


@bp.route('/<slug>/creation/remove/<int:adv_id>', methods=['POST'])
@require_login
def creation_remove(slug: str, adv_id: int):
    """Remove a creation-phase allocation (undo before sign-off)."""
    coterie = _get_coterie_or_404(slug)

    if not _is_forming(coterie):
        flash('Cannot edit allocations after sign-off.', 'danger')
        return redirect(url_for('coteries.view', slug=slug))

    discord_id = get_player_discord_id()
    player_char = _get_player_character(discord_id)
    if not player_char or not _get_coterie_member(coterie, player_char):
        abort(403)

    adv = CoterieAdvantage.query.filter_by(
        id=adv_id, coterie_id=coterie.id, notes='__creation__'
    ).first_or_404()

    dots = adv.dots
    is_flaw = adv.advantage_type == 'flaw'

    member = _get_coterie_member(coterie, player_char)
    if is_flaw:
        # Removing a flaw claws back the bonus dots it granted.
        # If the pool has already spent those dots, block the removal.
        if member.free_dots_remaining < dots:
            flash(
                f'Cannot remove "{adv.name}" — its bonus dot(s) have already been spent. '
                'Remove an allocation first.',
                'danger',
            )
            return redirect(url_for('coteries.view', slug=slug))

    db.session.delete(adv)

    if is_flaw:
        member.free_dots_remaining -= dots
    else:
        member.free_dots_remaining += dots

    coterie.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    flash(f'Removed "{adv.name}" — {dots} creation dot(s) {"returned" if not is_flaw else "forfeited"}.', 'info')
    return redirect(url_for('coteries.view', slug=slug))


# ---------------------------------------------------------------------------
# Member: submit coterie for staff sign-off
# ---------------------------------------------------------------------------

@bp.route('/<slug>/submit-for-review', methods=['POST'])
@require_login
def submit_for_review(slug: str):
    coterie = _get_coterie_or_404(slug)

    if not _is_forming(coterie):
        flash('This coterie is not in the formation phase.', 'warning')
        return redirect(url_for('coteries.view', slug=slug))

    discord_id = get_player_discord_id()
    player_char = _get_player_character(discord_id)
    if not player_char or not _get_coterie_member(coterie, player_char):
        abort(403)

    coterie.creation_state = 'submitted'
    coterie.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    flash('Coterie submitted for staff sign-off. You\'ll hear back soon.', 'success')
    return redirect(url_for('coteries.view', slug=slug))


# ---------------------------------------------------------------------------
# Staff: approve or send back a submitted coterie
# ---------------------------------------------------------------------------

@bp.route('/<slug>/approve-formation', methods=['POST'])
@require_staff
def approve_formation(slug: str):
    coterie = _get_coterie_or_404(slug)

    coterie.creation_state = 'active'
    coterie.status = 'active'
    coterie.creation_notes = None
    coterie.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    flash(f'{coterie.name} formation approved — coterie is now active.', 'success')
    return redirect(url_for('coteries.manage', slug=slug))


@bp.route('/<slug>/sendback-formation', methods=['POST'])
@require_staff
def sendback_formation(slug: str):
    coterie = _get_coterie_or_404(slug)

    notes = request.form.get('notes', '').strip()
    coterie.creation_state = 'forming'
    coterie.creation_notes = notes or None
    coterie.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    flash(f'{coterie.name} sent back to formation with notes.', 'info')
    return redirect(url_for('coteries.manage', slug=slug))


# ---------------------------------------------------------------------------
# Staff: delete a draft/pending coterie
# ---------------------------------------------------------------------------

@bp.route('/<slug>/delete', methods=['POST'])
@require_staff
def delete(slug: str):
    coterie = _get_coterie_or_404(slug)

    name = coterie.name

    # Clear background donation references before deleting
    DbCharacterBackground.query.filter_by(donated_coterie_id=coterie.id).update(
        {'donated_coterie_id': None}
    )
    DbCharacterBackground.query.filter_by(donation_pending_coterie_id=coterie.id).update(
        {'donation_pending_coterie_id': None}
    )

    db.session.delete(coterie)  # cascades members + advantages
    db.session.commit()
    flash(f'Coterie "{name}" deleted.', 'success')
    return redirect(url_for('coteries.index'))
