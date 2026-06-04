"""Coterie management routes — creation, setup, public view, and blanking."""

import logging
import re
from datetime import datetime, timezone

from flask import (
    Blueprint, render_template, request, redirect, url_for, flash, abort,
)

from app.auth import require_staff, require_login, get_player_discord_id, is_staff
from app.db import (
    db, Coterie, CoterieMember, CoterieAdvantage,
    DbCharacter, DbCharacterBackground,
)
from app.db_service import DBService
from app.game_calendar import next_night_after_downtime

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
    from flask import session as _session
    is_member = False
    player_char = None
    my_backgrounds = []
    if _session.get('authenticated'):
        discord_id = get_player_discord_id()
        player_char = _get_player_character(discord_id)
        if player_char:
            is_member = bool(_get_coterie_member(coterie, player_char))
            # Backgrounds the player can donate (not already donated anywhere)
            my_backgrounds = DbCharacterBackground.query.filter_by(
                character_name=player_char.character_name,
                donated_coterie_id=None,
            ).filter(DbCharacterBackground.dots_total > 0).all()

    pool_backgrounds = [a for a in coterie.advantages if a.advantage_type == 'background']
    pool_merits = [a for a in coterie.advantages if a.advantage_type == 'merit']
    pool_flaws = [a for a in coterie.advantages if a.advantage_type == 'flaw']

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
        is_staff_user=is_staff(),
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
    # All active characters not yet in this coterie
    existing_ids = [m.roster_character_id for m in coterie.members]
    available_chars = DbCharacter.query.filter(
        DbCharacter.active == True,
        ~DbCharacter.id.in_(existing_ids) if existing_ids else True,
    ).order_by(DbCharacter.character_name).all()

    return render_template(
        'coteries/manage.html',
        coterie=coterie,
        available_chars=available_chars,
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
    ).update({'donated_coterie_id': None})

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

    notes = request.form.get('flaw_notes', '').strip()
    bg.donated_coterie_id = coterie.id
    if notes:
        # Append flaw note to any existing notes via advantage entry
        flaw_adv = CoterieAdvantage(
            coterie_id=coterie.id,
            name=f'{bg.background_name} flaw(s)',
            dots=0,
            advantage_type='flaw',
            notes=notes,
            added_by=player_char.character_name,
            created_at=datetime.now(timezone.utc),
        )
        db.session.add(flaw_adv)

    coterie.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    flash(f'{bg.background_name} donated to {coterie.name}.', 'success')
    return redirect(url_for('coteries.view', slug=slug))


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
