"""Donated backgrounds that outlive the character who donated them.

Donating a background to a coterie is normally a loan: `undonate_background`
and staff's `remove_member` both hand it straight back to the donor's PC. A
character *leaving play* is different — the coterie keeps the asset, and a
remaining member may buy it at standard price to take ownership.

Retirement reaches the database by three routes (the bot's status API writes
the row directly, staff use `roster.set_status`, and `roster.deactivate` goes
through `db_service.deactivate_character`), so the orphaning lives here rather
than in any one of them.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func

from app.db import DbCharacterBackground, DbSpendRequest, db
from app.xp_rules import calculate_xp_cost

# The category a donated background is bought back under. It is the ordinary
# advantage category, so the price is whatever the shared rules table says a
# background costs — "standard price" is not re-stated here.
PURCHASE_CATEGORY = 'Advantage (Merit/Background)'


def _now_str() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')


def orphan_donated_backgrounds(character_name: str) -> list[DbCharacterBackground]:
    """Leave this character's donated backgrounds with their coteries.

    Called when a character stops being active. Returns the rows orphaned, and
    does not commit — the caller's transaction owns that.
    """
    if not character_name:
        return []

    rows = DbCharacterBackground.query.filter(
        func.lower(DbCharacterBackground.character_name) == character_name.lower(),
        DbCharacterBackground.donated_coterie_id.is_not(None),
        DbCharacterBackground.orphaned_from.is_(None),
    ).all()

    now = _now_str()
    for row in rows:
        row.orphaned_from = row.character_name
        row.orphaned_at = now

    # A donation still awaiting staff approval never became the coterie's, and
    # the donor is no longer around to see it through, so it is withdrawn
    # rather than orphaned.
    DbCharacterBackground.query.filter(
        func.lower(DbCharacterBackground.character_name) == character_name.lower(),
        DbCharacterBackground.donation_pending_coterie_id.is_not(None),
    ).update({'donation_pending_coterie_id': None}, synchronize_session=False)

    return rows


def reclaim_donated_backgrounds(character_name: str) -> list[DbCharacterBackground]:
    """Take this character's donations back off offer when they return to play.

    The mirror of orphan_donated_backgrounds, for a status corrected back to
    active. Only rows still held by this character are reclaimed — one already
    bought belongs to its buyer and is no longer orphaned, so it is untouched.
    Does not commit.
    """
    if not character_name:
        return []

    rows = DbCharacterBackground.query.filter(
        func.lower(DbCharacterBackground.character_name) == character_name.lower(),
        DbCharacterBackground.orphaned_from.is_not(None),
    ).all()
    for row in rows:
        row.orphaned_from = None
        row.orphaned_at = None
    return rows


def orphaned_backgrounds(coterie_id: int) -> list[DbCharacterBackground]:
    """Backgrounds this coterie kept after their donor left play."""
    return DbCharacterBackground.query.filter(
        DbCharacterBackground.donated_coterie_id == coterie_id,
        DbCharacterBackground.orphaned_from.is_not(None),
    ).order_by(DbCharacterBackground.background_name).all()


def purchase_price(bg: DbCharacterBackground) -> int:
    """Standard price for the dots still on an orphaned background.

    Blanked dots are already spent, so the buyer pays for what is left.
    """
    return calculate_xp_cost(PURCHASE_CATEGORY, 0, bg.dots_available)


def transfer_blocker(bg: DbCharacterBackground, buyer_name: str) -> str | None:
    """Why the row cannot move to `buyer_name`, or None if it can.

    Only the conditions that make the *transfer itself* impossible. Kept apart
    from `blocking_reason` because approving a purchase must not be blocked by
    the pending purchase it is approving.
    """
    if bg.orphaned_from is None:
        return 'That background still belongs to its donor.'
    if bg.dots_available <= 0:
        return f'{bg.background_name} has no dots left to buy.'

    # character_backgrounds is unique on (character_name, background_key), so a
    # buyer who already has this background cannot receive the row. Merging the
    # two would silently rewrite dot totals under V5's per-dot pricing, so the
    # purchase is refused and left for staff rather than guessed at.
    clash = DbCharacterBackground.query.filter(
        func.lower(DbCharacterBackground.character_name) == buyer_name.lower(),
        DbCharacterBackground.background_key == bg.background_key,
    ).first()
    if clash is not None:
        return (
            f'{buyer_name} already has {clash.background_name}. Combining it '
            f'with the coterie\'s copy is a staff decision, so this purchase '
            f'cannot be made from here.'
        )
    return None


def blocking_reason(bg: DbCharacterBackground, buyer_name: str) -> str | None:
    """Why `buyer_name` cannot offer to buy `bg`, or None if they can."""
    blocked = transfer_blocker(bg, buyer_name)
    if blocked is not None:
        return blocked

    pending = DbSpendRequest.query.filter(
        DbSpendRequest.purchased_background_id == bg.id,
        func.lower(DbSpendRequest.status) == 'pending',
    ).first()
    if pending is not None:
        return (
            f'A purchase of {bg.background_name} by '
            f'{pending.character_name} is already awaiting staff review.'
        )
    return None


def approval_blocker(spend) -> str | None:
    """Why an approved purchase could not complete, or None if it can.

    Checked *before* the XP is charged. The buyer can acquire the same
    background, members can keep blanking the orphan's remaining dots, and
    someone else's purchase can land first — all while this request sits in the
    queue. Without this the approval charges XP and patches the sheet while the
    transfer silently no-ops, leaving the background still on offer.
    """
    bg_id = getattr(spend, 'purchased_background_id', 0)
    if not bg_id:
        return None

    bg = db.session.get(DbCharacterBackground, bg_id)
    if bg is None:
        return 'the background this request was buying no longer exists'
    if bg.orphaned_from is None:
        return f'{bg.background_name} is no longer unclaimed'

    blocked = transfer_blocker(bg, spend.character_name)
    if blocked is not None:
        return blocked

    # The price was fixed against the dots available when the offer was made.
    if bg.dots_available < int(spend.new_dots or 0):
        return (
            f'{bg.background_name} now has {bg.dots_available} dot(s) available, '
            f'not the {spend.new_dots} this request was priced for'
        )
    return None


def claim_purchased_background(spend: DbSpendRequest) -> DbCharacterBackground | None:
    """Hand an orphaned background to the member whose purchase was approved.

    The row moves to the buyer and stays donated to the coterie — buying it
    restores a living owner, it does not take the asset out of the pool. Does
    not commit; the approving request's transaction owns that.
    """
    if not spend.purchased_background_id:
        return None

    bg = db.session.get(DbCharacterBackground, spend.purchased_background_id)
    if bg is None or bg.orphaned_from is None:
        return None

    # Re-check the uniqueness clash at approval time: the buyer may have picked
    # the background up by another route while this sat in the queue, and the
    # transfer would raise IntegrityError instead of failing legibly.
    if transfer_blocker(bg, spend.character_name) is not None:
        return None

    bg.character_name = spend.character_name
    bg.orphaned_from = None
    bg.orphaned_at = None
    bg.updated_at = _now_str()
    bg.updated_by = f'purchase:{spend.character_name}'[:100]
    return bg
