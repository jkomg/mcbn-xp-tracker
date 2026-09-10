"""Coterie management routes — creation, setup, public view, and blanking."""

import logging
import re
from datetime import datetime, timezone

from flask import (
    Blueprint, render_template, request, redirect, url_for, flash, abort,
)

from app.auth import require_staff, require_login, get_player_discord_id, is_staff
from app.db import (
    db, Coterie, CoterieMember, CoterieAdvantage, CoterieInvitation,
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


def _get_player_characters(discord_id: str) -> list[DbCharacter]:
    """All active characters belonging to this Discord user."""
    if not discord_id:
        return []
    return (
        DbCharacter.query
        .filter_by(player_discord=discord_id, active=True)
        .order_by(DbCharacter.character_name)
        .all()
    )


def _get_acting_member(coterie: Coterie, discord_id: str) -> CoterieMember | None:
    """Resolve which of this player's characters acts in this coterie.

    Players routinely have more than one active character, so the acting
    character is the one actually in *this* coterie rather than an arbitrary
    pick from the roster.

    Retirement and death set `active=False` but leave the membership row in
    place, so activity is checked here rather than assumed: without it a
    retired character keeps reading the private sheet and spending the pool.
    """
    if not discord_id:
        return None
    return (
        CoterieMember.query
        .join(DbCharacter, CoterieMember.roster_character_id == DbCharacter.id)
        .filter(
            CoterieMember.coterie_id == coterie.id,
            DbCharacter.player_discord == discord_id,
            DbCharacter.active,
        )
        .order_by(CoterieMember.joined_at.asc())
        .first()
    )


def _pending_invites(coterie: Coterie) -> list[CoterieInvitation]:
    return [i for i in coterie.invitations if i.status == 'pending']


def _get_pending_invite(coterie: Coterie, discord_id: str,
                        invite_id: int | None = None) -> CoterieInvitation | None:
    """A pending invitation held by one of this player's characters.

    `invite_id` binds the lookup to one specific invitation. A player can hold
    more than one invitation to the same coterie — two of their characters can
    both be invited — so accept/decline must name the invitation they mean
    rather than take whichever is oldest. Callers that only ask "does this
    player have any invitation here" (read access, the view banner) omit it.
    """
    if not discord_id:
        return None
    query = (
        CoterieInvitation.query
        .join(DbCharacter, CoterieInvitation.roster_character_id == DbCharacter.id)
        .filter(
            CoterieInvitation.coterie_id == coterie.id,
            CoterieInvitation.status == 'pending',
            DbCharacter.player_discord == discord_id,
        )
    )
    if invite_id is not None:
        query = query.filter(CoterieInvitation.id == invite_id)
    return query.order_by(CoterieInvitation.created_at.asc()).first()


def _can_view(coterie: Coterie) -> bool:
    """Coterie sheets are private to members, pending invitees, and staff.

    An invitee needs to read the sheet to decide whether to accept, so they get
    read access while their invitation stands — but no membership rights.
    """
    if is_staff():
        return True
    discord_id = get_player_discord_id()
    if _get_acting_member(coterie, discord_id) is not None:
        return True
    return _get_pending_invite(coterie, discord_id) is not None


def _member_by_character_name(coterie: Coterie, name: str) -> CoterieMember | None:
    if not name:
        return None
    for m in coterie.members:
        if m.character and m.character.character_name == name:
            return m
    return None


def _pool_available(coterie: Coterie) -> int:
    return sum(m.free_dots_remaining for m in coterie.members)


def _drain_pool(coterie: Coterie, dots: int,
                prefer: CoterieMember | None = None) -> bool:
    """Take `dots` out of the shared free-dot pool.

    Returns False (changing nothing) when the pool is short. Creation dots are
    spent collectively, so the check is on the pool total — checking a single
    member's balance lets another member's click bypass it.
    """
    if _pool_available(coterie) < dots:
        return False
    order = list(coterie.members)
    if prefer is not None:
        order.sort(key=lambda m: m.id != prefer.id)
    remaining = dots
    for m in order:
        take = min(m.free_dots_remaining, remaining)
        m.free_dots_remaining -= take
        remaining -= take
        if remaining <= 0:
            break
    return True


def _credit_pool(coterie: Coterie, dots: int,
                 prefer: CoterieMember | None = None) -> None:
    """Return `dots` to the pool, preferring whoever originally put them in."""
    target = prefer if prefer is not None else (coterie.members[0] if coterie.members else None)
    if target is not None:
        target.free_dots_remaining += dots


# ---------------------------------------------------------------------------
# Members + staff: coterie index
# ---------------------------------------------------------------------------

@bp.route('/')
@require_login
def index():
    """Staff see every coterie; players see only the ones they belong to.

    Pending invitations are listed separately so an invited player can find
    the ask without being a member yet.
    """
    discord_id = get_player_discord_id()
    my_invites = []
    query = Coterie.query.filter(Coterie.status.in_(['active', 'pending']))
    if not is_staff():
        my_invites = (
            CoterieInvitation.query
            .join(DbCharacter, CoterieInvitation.roster_character_id == DbCharacter.id)
            .filter(
                CoterieInvitation.status == 'pending',
                DbCharacter.player_discord == discord_id,
            )
            .all()
        )
        my_ids = [
            row.coterie_id for row in (
                CoterieMember.query
                .join(DbCharacter, CoterieMember.roster_character_id == DbCharacter.id)
                .filter(DbCharacter.player_discord == discord_id)
                .all()
            )
        ]
        if not my_ids:
            return render_template('coteries/index.html', coteries=[],
                                   my_invites=my_invites)
        query = query.filter(Coterie.id.in_(my_ids))
    coteries = query.order_by(Coterie.name).all()
    return render_template('coteries/index.html', coteries=coteries,
                           my_invites=my_invites)


# ---------------------------------------------------------------------------
# Members + staff: coterie page
#
# A coterie sheet carries staff sign-off notes, the creation pool and donation
# state, so it is private to its own members and staff. The public, in-character
# view of a coterie is its Chronicle Wiki page, which the sync builds from
# active coteries only.
# ---------------------------------------------------------------------------

@bp.route('/<slug>')
@require_login
def view(slug: str):
    coterie = _get_coterie_or_404(slug)
    if not _can_view(coterie):
        abort(404)

    # Donated backgrounds: from member PCs, grouped by character
    donated_bgs = DbCharacterBackground.query.filter_by(
        donated_coterie_id=coterie.id
    ).all()

    # Determine if the current player is a member (for blanking controls)
    player_char = None
    my_backgrounds = []
    my_pending = []
    acting_member = _get_acting_member(coterie, get_player_discord_id())
    is_member = acting_member is not None
    if acting_member is not None:
        player_char = acting_member.character
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
        budget=_creation_budget(coterie),
        pool_available=_pool_available(coterie),
        pending_invites=_pending_invites(coterie),
        my_invite=_get_pending_invite(coterie, get_player_discord_id()),
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
    member = _get_acting_member(coterie, discord_id)
    player_char = member.character if member else None

    # Must be a member or staff
    is_member_flag = member is not None
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

    # Spending from the shared free dot pool (flaws add dots, don't spend them)
    if advantage_type != 'flaw' and is_member_flag and not is_staff():
        if not _drain_pool(coterie, dots, prefer=member):
            flash(
                f'Only {_pool_available(coterie)} free dot(s) remaining in the pool.',
                'danger',
            )
            return redirect(url_for('coteries.view', slug=slug))

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
    member = _get_acting_member(coterie, discord_id)
    if member is None:
        abort(403)
    player_char = member.character

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
    member = _get_acting_member(coterie, discord_id)
    if member is None:
        abort(403)
    player_char = member.character

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
    member = _get_acting_member(coterie, discord_id)
    if member is None:
        abort(403)
    player_char = member.character

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
    member = _get_acting_member(coterie, discord_id)
    if member is None:
        abort(403)
    player_char = member.character

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
    my_characters = _get_player_characters(discord_id)

    if not my_characters:
        flash('You need an active character to propose a coterie.', 'danger')
        return redirect(url_for('coteries.index'))

    # A character can only be in one coterie at a time, so only the player's
    # unattached characters can propose one.
    eligible = [
        c for c in my_characters
        if not CoterieMember.query.filter_by(roster_character_id=c.id).first()
    ]
    if not eligible:
        existing = CoterieMember.query.filter_by(
            roster_character_id=my_characters[0].id
        ).first()
        flash('Your character is already in a coterie.', 'warning')
        return redirect(url_for('coteries.view', slug=existing.coterie.slug))

    # Which character is proposing. Players commonly have more than one, so the
    # choice is explicit and re-validated server-side rather than inferred.
    player_char = eligible[0]
    if request.method == 'POST' and len(eligible) > 1:
        chosen_id = request.form.get('proposer_id', type=int)
        chosen = next((c for c in eligible if c.id == chosen_id), None)
        if chosen is None:
            flash('Choose which of your characters is proposing this coterie.', 'danger')
            return render_template('coteries/propose.html', player_char=eligible[0],
                                   eligible=eligible, invitable=[])
        player_char = chosen

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
            return render_template('coteries/propose.html', player_char=player_char,
                               eligible=eligible, invitable=invitable)

        if Coterie.query.filter_by(name=name).first():
            flash(f'A coterie named "{name}" already exists.', 'danger')
            return render_template('coteries/propose.html', player_char=player_char,
                               eligible=eligible, invitable=invitable)

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

        # Invite the chosen characters. They are not members, and contribute
        # no creation dots, until they accept.
        invited_chars = DbCharacter.query.filter(
            DbCharacter.id.in_(invite_ids),
            DbCharacter.active,
        ).all()
        invited_count = 0
        for char in invited_chars:
            # Skip anyone already in a coterie
            if CoterieMember.query.filter_by(roster_character_id=char.id).first():
                continue
            db.session.add(CoterieInvitation(
                coterie_id=coterie.id,
                roster_character_id=char.id,
                status='pending',
                invited_by=player_char.character_name,
                created_at=now,
            ))
            invited_count += 1

        db.session.commit()
        note = (f' {invited_count} invitation(s) sent — they join the coterie, and add '
                'their creation dots, once they accept.') if invited_count else ''
        flash(f'Coterie "{name}" proposed!{note}', 'success')
        return redirect(url_for('coteries.view', slug=coterie.slug))

    return render_template('coteries/propose.html', player_char=player_char,
                               eligible=eligible, invitable=invitable)


# ---------------------------------------------------------------------------
# Invited player: accept / decline; members: revoke
# ---------------------------------------------------------------------------

@bp.route('/<slug>/invite/<int:invite_id>/accept', methods=['POST'])
@require_login
def accept_invitation(slug: str, invite_id: int):
    """Invited character joins, bringing their creation dots into the pool."""
    coterie = _get_coterie_or_404(slug)
    invite = _get_pending_invite(coterie, get_player_discord_id(), invite_id)
    if invite is None:
        abort(403)

    # Re-check here, not just at invite time: the character may have joined
    # another coterie while this invitation was outstanding.
    if CoterieMember.query.filter_by(roster_character_id=invite.roster_character_id).first():
        flash(f'{invite.character.character_name} is already in a coterie.', 'warning')
        return redirect(url_for('coteries.index'))

    # Same reason, for retirement or death: accepting commits creation dots to
    # the formation budget, and an inactive character must not be in it.
    if not invite.character.active:
        flash(
            f'{invite.character.character_name} is no longer active and cannot '
            f'join a coterie.',
            'warning',
        )
        return redirect(url_for('coteries.index'))

    now = datetime.now(timezone.utc)
    db.session.add(CoterieMember(
        coterie_id=coterie.id,
        roster_character_id=invite.roster_character_id,
        free_dots_remaining=_CREATION_DOTS_PER_MEMBER,
        role='member',
        joined_at=now,
    ))
    invite.status = 'accepted'
    invite.responded_at = now
    coterie.updated_at = now
    db.session.commit()
    flash(
        f'{invite.character.character_name} joined {coterie.name}, adding '
        f'{_CREATION_DOTS_PER_MEMBER} creation dots to the pool.',
        'success',
    )
    return redirect(url_for('coteries.view', slug=slug))


@bp.route('/<slug>/invite/<int:invite_id>/decline', methods=['POST'])
@require_login
def decline_invitation(slug: str, invite_id: int):
    coterie = _get_coterie_or_404(slug)
    invite = _get_pending_invite(coterie, get_player_discord_id(), invite_id)
    if invite is None:
        abort(403)

    invite.status = 'declined'
    invite.responded_at = datetime.now(timezone.utc)
    db.session.commit()
    flash(f'Invitation to {coterie.name} declined.', 'info')
    return redirect(url_for('coteries.index'))


@bp.route('/<slug>/invite/<int:invite_id>/revoke', methods=['POST'])
@require_login
def revoke_invitation(slug: str, invite_id: int):
    """A member (or staff) withdraws an invitation that has not been answered."""
    coterie = _get_coterie_or_404(slug)
    if _get_acting_member(coterie, get_player_discord_id()) is None and not is_staff():
        abort(403)

    invite = CoterieInvitation.query.filter_by(
        id=invite_id, coterie_id=coterie.id, status='pending'
    ).first_or_404()
    invite.status = 'revoked'
    invite.responded_at = datetime.now(timezone.utc)
    db.session.commit()
    flash(f'Invitation to {invite.character.character_name} withdrawn.', 'info')
    return redirect(url_for('coteries.view', slug=slug))


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
    member = _get_acting_member(coterie, discord_id)
    if member is None:
        abort(403)
    player_char = member.character

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

    # Creation dots are spent from the shared pool, drawing on the allocating
    # member's own dots first.
    _drain_pool(coterie, dots, prefer=member)

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
    member = _get_acting_member(coterie, discord_id)
    if member is None:
        abort(403)
    player_char = member.character

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

    # Grant bonus dots to the pool, credited to the member who took the flaw
    _credit_pool(coterie, dots, prefer=member)

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
    member = _get_acting_member(coterie, discord_id)
    if member is None:
        abort(403)

    adv = CoterieAdvantage.query.filter_by(
        id=adv_id, coterie_id=coterie.id, notes='__creation__'
    ).first_or_404()

    dots = adv.dots
    is_flaw = adv.advantage_type == 'flaw'

    # Whoever originally took the flaw / made the allocation owns those dots,
    # regardless of which member is clicking Remove now.
    owner = _member_by_character_name(coterie, adv.added_by) or member

    if is_flaw:
        # Removing a flaw claws back the bonus dots it granted. The check is on
        # the pool total, not one member's balance — otherwise a second member
        # can remove a flaw whose bonus dots the coterie has already spent and
        # leave the sheet over-allocated.
        if not _drain_pool(coterie, dots, prefer=owner):
            flash(
                f'Cannot remove "{adv.name}" — its bonus dot(s) have already been spent. '
                'Remove an allocation first.',
                'danger',
            )
            return redirect(url_for('coteries.view', slug=slug))
        db.session.delete(adv)
    else:
        db.session.delete(adv)
        _credit_pool(coterie, dots, prefer=owner)

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
    member = _get_acting_member(coterie, discord_id)
    if member is None:
        abort(403)

    pending = _pending_invites(coterie)
    if pending:
        names = ', '.join(i.character.character_name for i in pending)
        flash(
            f'Still waiting on {names} to answer their invitation. Their creation '
            'dots join the pool on accept, so settle invitations before sign-off.',
            'danger',
        )
        return redirect(url_for('coteries.view', slug=slug))

    # Allocation routes are gated on 'forming', so any dots left unspent at
    # sign-off are lost for good. Block rather than silently burn them.
    budget = _creation_budget(coterie)
    if budget['used'] == 0:
        flash('Allocate your creation dots before submitting for sign-off.', 'danger')
        return redirect(url_for('coteries.view', slug=slug))
    if budget['left'] > 0:
        flash(
            f'{budget["left"]} creation dot(s) still unspent — allocate them before '
            'submitting, as they cannot be spent after sign-off.',
            'danger',
        )
        return redirect(url_for('coteries.view', slug=slug))

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

    if coterie.creation_state != 'submitted':
        flash(
            f'{coterie.name} has not been submitted for sign-off — nothing to approve.',
            'warning',
        )
        return redirect(url_for('coteries.manage', slug=slug))

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

    # Guard against knocking an already-approved coterie back into formation,
    # which would reopen player editing of a signed-off sheet.
    if coterie.creation_state != 'submitted':
        flash(
            f'{coterie.name} has not been submitted for sign-off — nothing to send back.',
            'warning',
        )
        return redirect(url_for('coteries.manage', slug=slug))

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
