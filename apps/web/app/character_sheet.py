"""Character sheet patching: apply approved spends to CharacterDraft.character_data.

Called after spend approval to keep the living character sheet up to date.
Also updates the character's wiki page body with a regenerated stats section.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def _normalize_skill_key(name: str) -> str:
    """Canonical skill-dict key: lowercase, spaces collapsed to underscores.

    Matches the fixed key lists player/sheet.html iterates (e.g. 'animal_ken')
    and the client-side lookup in character.html's JS — a plain .lower() with
    no space handling fails every multiword skill.
    """
    return re.sub(r'\s+', '_', (name or '').strip().lower())


def _merge_cc_specialties(data: dict) -> None:
    """Merge CC-format skillSpecialties (list of {skill, name}) into the
    skill_specialties dict in-place, if skill_specialties isn't already set.

    Mirrors the specialty-merge half of player.py's _normalize_sheet_data
    (that function delegates here) so validation/patch logic sees the same
    specialties a rendered sheet would — otherwise a specialty recorded only
    in CC's list format looks unrated/absent to character_skill_rating and
    character_has_specialty, and once a Skill Specialty patch creates
    skill_specialties from scratch, _normalize_sheet_data's own
    'if not already present' guard permanently stops deriving from the CC
    list, silently orphaning any specialties that were only ever there.
    """
    if 'skill_specialties' in data:
        return
    cc_specs = list(data.get('skillSpecialties') or [])
    predator = data.get('predatorType')
    if isinstance(predator, dict):
        cc_specs = cc_specs + list(predator.get('pickedSpecialties') or [])
    merged: dict[str, list[str]] = {}
    for item in cc_specs:
        if isinstance(item, dict):
            skill = _normalize_skill_key(item.get('skill', ''))
            name = item.get('name', '').strip()
            if skill and name:
                merged.setdefault(skill, []).append(name)
    if merged:
        data['skill_specialties'] = merged

_DISCIPLINE_CATEGORIES = frozenset({
    'Discipline (In-Clan)',
    'Discipline (Out-of-Clan)',
    'Caitiff Discipline',
    'Ghoul Discipline',
})

_SKILL_CATEGORIES = frozenset({'Skill', 'New Skill'})

# Advantages (Merits/Backgrounds) that track a required sub-category/faction
# via a parenthetical suffix on the plain sheet name — e.g. "Status (Tremere)"
# is the existing informal convention already present in sheet data, not a
# new field. Maps lowercased trait_name -> player-facing label for that
# sub-category (used by later PRs' form UI/staff-review display). Adding a
# future trigger trait is a one-line change here; deliberately scoped to
# Status only for now — Contacts/Mentor/Allies/Retainer are out of scope.
_SUBCATEGORY_ADVANTAGES = {
    'status': 'Faction / Group',
}


def subcategory_label_for_trait(trait_name: str, spend_category: str | None = None) -> str | None:
    """Return the sub-category label (e.g. 'Faction / Group') for a trigger

    trait like 'Status', or None if trait_name isn't one of
    _SUBCATEGORY_ADVANTAGES, or spend_category isn't
    'Advantage (Merit/Background)'. Used by staff-facing templates to
    distinguish a Discipline power_name (e.g. "Auspex 3") from a structured
    Advantage sub-category value (e.g. "Tremere") stored in the same
    power_name field.

    The category gate matters because trait_name is free text: a Discipline
    spend whose trait_name happens to be typed as "Status" (a power name,
    not the Status advantage) must not be mislabeled as a Faction/Group.

    Skill Specialty uses the same power_name field for the specialty name.
    Unlike Advantage sub-categories, the trigger here is the category alone
    (spend_category == 'Skill Specialty') — the skill name in trait_name
    varies freely, so there's no fixed trait-name set to key off, and the
    category itself is already unambiguous.
    """
    if spend_category == 'Skill Specialty':
        return 'Specialty'
    if spend_category != 'Advantage (Merit/Background)':
        return None
    return _SUBCATEGORY_ADVANTAGES.get((trait_name or '').strip().lower())

_SHEET_MARKER_START = '<!-- CHARACTER_SHEET -->'
_SHEET_MARKER_END = '<!-- /CHARACTER_SHEET -->'

_DOT = '\u25cf'
_EMPTY = '\u25cb'


def patch_character_draft(spend) -> bool:
    """Apply an approved spend to the character's CharacterDraft.character_data.

    Also regenerates the character's wiki page stats section if a wiki page exists.
    Returns True if the draft was found and patched, False otherwise.
    Errors are logged but never raised — spend approval must not be blocked.
    """
    try:
        return _do_patch(spend)
    except Exception as exc:
        logger.warning('character_sheet patch failed for %s: %s', spend.character_name, exc)
        return False


def _find_approved_draft(character_name: str):
    """Return the roster character's approved CharacterDraft row, or None."""
    from app.db import CharacterDraft, DbCharacter
    from sqlalchemy import func

    char_row = DbCharacter.query.filter(
        func.lower(DbCharacter.character_name) == character_name.lower()
    ).first()
    if not char_row:
        return None

    return CharacterDraft.query.filter_by(
        roster_character_id=char_row.id,
        status='approved',
    ).first()


def _load_approved_sheet_data(character_name: str) -> dict | None:
    """Load the character_data JSON off the roster character's approved draft.

    Returns None if there's no roster character, no approved draft, or the
    stored JSON doesn't parse — any of which just means there's nothing to
    check/patch against.
    """
    draft = _find_approved_draft(character_name)
    if not draft or not draft.character_data:
        return None

    try:
        data = json.loads(draft.character_data)
    except (json.JSONDecodeError, TypeError):
        return None
    _merge_cc_specialties(data)
    return data


def _effective_advantage_name(trait_name: str, power_name: str) -> str:
    """Compute the sheet-storage/match name for an Advantage (Merit/Background) spend.

    Some Advantages (see _SUBCATEGORY_ADVANTAGES) track a required
    sub-category/faction via a parenthetical suffix on the plain name, e.g.
    "Status (Tremere)" — this is the existing informal convention already
    present in sheet data, not a new field. When the trait is one of these
    and a sub-category is given via power_name (dual-purpose: discipline
    power name OR advantage sub-category), fold it into the name. Otherwise
    (legacy calls with no power_name, or non-triggering traits) the plain
    trait_name is used unchanged.
    """
    trait_name = (trait_name or '').strip()
    power_name = (power_name or '').strip()
    if power_name and trait_name.lower() in _SUBCATEGORY_ADVANTAGES:
        return f'{trait_name} ({power_name})'
    return trait_name


def character_skill_rating(character_name: str, skill_name: str) -> int:
    """Return the character's current dot rating for a skill (0 if unrated/unknown).

    Reads the approved sheet's `skills` dict, keyed the same way `_apply_patch`
    stores it (lowercased skill name) — the source of truth for the
    "skill must be rated >= 1" gate on Skill Specialty purchases, not a
    client-supplied value.
    """
    data = _load_approved_sheet_data(character_name)
    if data is None:
        return 0
    try:
        return int(data.get('skills', {}).get(_normalize_skill_key(skill_name), 0))
    except (TypeError, ValueError):
        return 0


def character_has_specialty(character_name: str, skill_name: str, specialty_name: str) -> bool:
    """Return True if the character's approved sheet already has this specialty on this skill."""
    data = _load_approved_sheet_data(character_name)
    if data is None:
        return False
    skill_key = _normalize_skill_key(skill_name)
    specialty_key = (specialty_name or '').strip().lower()
    existing = data.get('skill_specialties', {}).get(skill_key, [])
    if not isinstance(existing, list):
        return False
    return any((s or '').strip().lower() == specialty_key for s in existing)


def find_trait_sheet_match(
    character_name: str, category: str, trait_name: str, power_name: str = '',
) -> dict | None:
    """Check a pending spend's trait name against the character's current sheet.

    Only meaningful for 'Advantage (Merit/Background)': these are the traits
    that can carry a parenthetical source (e.g. "Status (Tremere)"), so a
    spend submitted as plain "Status" can silently miss an existing entry and
    create a stray duplicate instead of raising it — the bug that hit Marcus.

    power_name carries the sub-category/faction for triggering traits (see
    _SUBCATEGORY_ADVANTAGES), e.g. trait_name="Status", power_name="Tremere"
    matches/folds to "Status (Tremere)", the same convention _apply_patch uses.

    Returns None if there's nothing to check (wrong category, no sheet, blank
    trait name). Otherwise returns {'exact': bool, 'close_matches': [...]} —
    close_matches lists existing entries whose name starts with trait_name
    but isn't an exact match, e.g. trait_name="Status" (no power_name)
    surfaces an existing "Status (Tremere)" entry as a likely-intended match.

    When the current spend already specifies a structured sub-category (e.g.
    "Status"/"Tremere"), other existing entries that are themselves distinct
    structured sub-categories of the same trait (e.g. "Status (Anarch
    Movement)") are NOT surfaced as close matches — two different factions
    of Status are independent, unambiguous entries, not a warning-worthy
    near-miss of each other.
    """
    if category != 'Advantage (Merit/Background)':
        return None
    trait_name = (trait_name or '').strip()
    if not trait_name:
        return None
    power_name = (power_name or '').strip()

    data = _load_approved_sheet_data(character_name)
    if data is None:
        return None

    base_key = trait_name.lower()
    effective_name = _effective_advantage_name(trait_name, power_name)
    key = effective_name.lower()
    has_subcategory = bool(power_name) and base_key in _SUBCATEGORY_ADVANTAGES
    structured_prefix = f'{base_key} ('

    entries = list(data.get('backgrounds') or []) + list(data.get('merits') or [])
    exact = any((e.get('name') or '').lower() == key for e in entries)

    close_matches = []
    for e in entries:
        name_lower = (e.get('name') or '').lower()
        if name_lower == key or not name_lower.startswith(base_key):
            continue
        if has_subcategory and name_lower.startswith(structured_prefix) and name_lower.endswith(')'):
            # Independent structured sub-category (different faction) — not
            # an ambiguous close match against the current spend's faction.
            continue
        close_matches.append({'name': e.get('name', ''), 'level': e.get('level', 0)})

    return {'exact': exact, 'close_matches': close_matches}


def _do_patch(spend) -> bool:
    from app.db import db, WikiPage
    from sqlalchemy import func

    draft = _find_approved_draft(spend.character_name)
    if not draft or not draft.character_data:
        return False

    try:
        data = json.loads(draft.character_data)
    except (json.JSONDecodeError, TypeError):
        return False
    # Merge CC-format specialties before patching so a Skill Specialty write
    # doesn't create skill_specialties from scratch and silently orphan
    # specialties that only ever existed in the CC skillSpecialties list.
    _merge_cc_specialties(data)

    power_name = (getattr(spend, 'power_name', '') or '').strip()
    patched = _apply_patch(data, spend.spend_category, spend.trait_name, power_name, spend.new_dots)
    if not patched:
        return False

    draft.character_data = json.dumps(data)
    draft.updated_at = datetime.now(timezone.utc)

    # Update wiki page stats section if one exists
    wiki_page = WikiPage.query.filter(
        WikiPage.category == 'characters',
        func.lower(WikiPage.title) == spend.character_name.lower(),
    ).first()
    if wiki_page:
        _update_wiki_stats_section(wiki_page, data)

    db.session.commit()
    return True


def _apply_patch(data: dict, category: str, trait_name: str, power_name: str, new_dots: int) -> bool:
    """Mutate data in-place. Returns True if a change was applied."""
    trait_name = (trait_name or '').strip()
    if not trait_name:
        return False

    if category == 'Attribute':
        key = trait_name.lower()
        attrs = data.get('attributes', {})
        if key in attrs:
            attrs[key] = new_dots
            return True
        return False

    if category in _SKILL_CATEGORIES:
        key = trait_name.lower()
        data.setdefault('skills', {})[key] = new_dots
        return True

    if category in _DISCIPLINE_CATEGORIES:
        if not power_name:
            return False  # can't patch sheet without knowing which specific power
        discipline = trait_name.lower()
        disciplines = data.setdefault('disciplines', [])
        for power in disciplines:
            if power.get('name', '').lower() == power_name.lower():
                power['level'] = new_dots
                return True
        disciplines.append({
            'name': power_name,
            'discipline': discipline,
            'level': new_dots,
            'summary': '',
            'description': '',
            'dicePool': '',
            'amalgamPrerequisites': '',
            'rouseChecks': 1,
        })
        return True

    if category == 'Blood Sorcery Ritual':
        rituals = data.setdefault('rituals', [])
        if not any(r.get('name', '').lower() == trait_name.lower() for r in rituals):
            rituals.append({
                'name': trait_name,
                'level': new_dots,
                'discipline': 'blood sorcery',
                'summary': '',
                'rouseChecks': 1,
                'requiredTime': '',
                'dicePool': 'Intelligence + Blood Sorcery',
                'ingredients': '',
            })
        return True

    if category == 'Thin-Blood Alchemy Formula':
        rituals = data.setdefault('rituals', [])
        if not any(r.get('name', '').lower() == trait_name.lower() for r in rituals):
            rituals.append({
                'name': trait_name,
                'level': new_dots,
                'discipline': 'thin-blood alchemy',
                'summary': '',
                'rouseChecks': 1,
                'requiredTime': '',
                'dicePool': 'Intelligence + Alchemy',
                'ingredients': '',
            })
        return True

    if category == 'Advantage (Merit/Background)':
        # power_name is dual-purpose: specific power/ritual name for
        # discipline spends (above), or the required sub-category/faction
        # for triggering Advantages like Status (see _SUBCATEGORY_ADVANTAGES)
        # — folded into the stored name as "Status (Tremere)", matching the
        # existing informal convention already present in sheet data.
        effective_name = _effective_advantage_name(trait_name, power_name)
        key = effective_name.lower()
        # Schema v7+ splits Backgrounds (Status, Resources, Contacts, Haven,
        # etc.) into their own array, separate from Merits — but both use the
        # same entry shape (`type` is always 'merit', it's just stored under
        # a different top-level key). Check both arrays for an existing entry
        # before appending a new one, so raising an existing background
        # doesn't create a stray duplicate in the wrong array.
        for array_name in ('backgrounds', 'merits'):
            items = data.get(array_name)
            if not isinstance(items, list):
                continue
            for item in items:
                if item.get('name', '').lower() == key:
                    item['level'] = new_dots
                    return True
        # No existing entry in either array — this is a genuinely new
        # purchase. We can't reliably tell "new Background" from "new Merit"
        # from the trait name alone without duplicating the character-app's
        # full background-name catalog here (a maintenance/drift risk), so
        # default to merits, matching this function's original behavior.
        data.setdefault('merits', []).append({
            'name': effective_name,
            'level': new_dots,
            'summary': '',
            'excludes': [],
            'type': 'merit',
        })
        return True

    if category == 'Loresheet':
        purchases = data.setdefault('loresheet_purchases', [])
        # Avoid adding the same loresheet+dot twice
        for lp in purchases:
            if lp.get('dot') == new_dots and lp.get('loresheet_id', '').lower().startswith(trait_name.lower()):
                return True
        purchases.append({'loresheet_id': trait_name, 'dot': new_dots})
        return True

    if category == 'Skill Specialty':
        # power_name carries the specialty name here (dual-purpose field, same
        # as Discipline power name / Advantage sub-category above).
        if not power_name:
            return False
        skill_key = _normalize_skill_key(trait_name)
        specialties = data.setdefault('skill_specialties', {}).setdefault(skill_key, [])
        if any((s or '').lower() == power_name.lower() for s in specialties):
            return False  # already present — submit_spend should have caught this
        specialties.append(power_name)
        return True

    if category == 'Humanity':
        data['humanity'] = new_dots
        return True

    return False


def reverse_character_sheet_patch(spend) -> bool:
    """Undo an already-applied patch_character_draft() for this spend.

    Only rolls back a field/entry if it still holds exactly the value this
    spend set — if something else has changed it since (e.g. a later spend
    raised the same trait further), skips rather than clobbering newer state.
    Also regenerates the wiki stats section on success. Returns True if the
    sheet was rolled back, False if there was nothing to safely undo.
    Errors are logged but never raised — a reversal must not be blocked by this.
    """
    try:
        return _do_reverse_patch(spend)
    except Exception as exc:
        logger.warning('character_sheet reverse-patch failed for %s: %s', spend.character_name, exc)
        return False


def _do_reverse_patch(spend) -> bool:
    from app.db import db, WikiPage
    from sqlalchemy import func

    draft = _find_approved_draft(spend.character_name)
    if not draft or not draft.character_data:
        return False

    try:
        data = json.loads(draft.character_data)
    except (json.JSONDecodeError, TypeError):
        return False
    _merge_cc_specialties(data)

    power_name = (getattr(spend, 'power_name', '') or '').strip()
    reverted = _apply_reverse_patch(
        data, spend.spend_category, spend.trait_name, power_name,
        spend.current_dots, spend.new_dots,
    )
    if not reverted:
        return False

    draft.character_data = json.dumps(data)
    draft.updated_at = datetime.now(timezone.utc)

    wiki_page = WikiPage.query.filter(
        WikiPage.category == 'characters',
        func.lower(WikiPage.title) == spend.character_name.lower(),
    ).first()
    if wiki_page:
        _update_wiki_stats_section(wiki_page, data)

    db.session.commit()
    return True


def _apply_reverse_patch(data: dict, category: str, trait_name: str, power_name: str,
                          current_dots: int, new_dots: int) -> bool:
    """Mutate data in-place to undo a prior _apply_patch call. Returns True if reverted."""
    trait_name = (trait_name or '').strip()
    if not trait_name:
        return False

    if category == 'Attribute':
        key = trait_name.lower()
        attrs = data.get('attributes', {})
        if attrs.get(key) == new_dots:
            attrs[key] = current_dots
            return True
        return False

    if category in _SKILL_CATEGORIES:
        key = trait_name.lower()
        skills = data.get('skills', {})
        if skills.get(key) == new_dots:
            skills[key] = current_dots
            return True
        return False

    if category in _DISCIPLINE_CATEGORIES:
        if not power_name:
            return False
        # Unlike a background/merit rating, a named discipline power is a
        # discrete, one-time purchase — it isn't "leveled up" again later
        # under the same name. So undoing one always removes the entry,
        # regardless of current_dots (the discipline's overall rating
        # before this purchase), rather than reducing its level in place.
        disciplines = data.get('disciplines', [])
        for power in disciplines:
            if power.get('name', '').lower() == power_name.lower() and power.get('level') == new_dots:
                disciplines.remove(power)
                return True
        return False

    if category in ('Blood Sorcery Ritual', 'Thin-Blood Alchemy Formula'):
        rituals = data.get('rituals', [])
        for r in rituals:
            if r.get('name', '').lower() == trait_name.lower() and r.get('level') == new_dots:
                rituals.remove(r)
                return True
        return False

    if category == 'Advantage (Merit/Background)':
        effective_name = _effective_advantage_name(trait_name, power_name)
        key = effective_name.lower()
        for array_name in ('backgrounds', 'merits'):
            items = data.get(array_name)
            if not isinstance(items, list):
                continue
            for item in items:
                if item.get('name', '').lower() == key and item.get('level') == new_dots:
                    if current_dots == 0:
                        items.remove(item)
                    else:
                        item['level'] = current_dots
                    return True
        return False

    if category == 'Loresheet':
        purchases = data.get('loresheet_purchases', [])
        for lp in purchases:
            if lp.get('dot') == new_dots and lp.get('loresheet_id', '').lower() == trait_name.lower():
                purchases.remove(lp)
                return True
        return False

    if category == 'Skill Specialty':
        if not power_name:
            return False
        skill_key = _normalize_skill_key(trait_name)
        specialties = data.get('skill_specialties', {}).get(skill_key, [])
        for s in specialties:
            if (s or '').lower() == power_name.lower():
                specialties.remove(s)
                return True
        return False

    if category == 'Humanity':
        if data.get('humanity') == new_dots:
            data['humanity'] = current_dots
            return True
        return False

    return False


def _dots_str(n: int, max_dots: int = 5) -> str:
    n = max(0, min(n, max_dots))
    return _DOT * n + _EMPTY * (max_dots - n)


def _generate_stats_markdown(data: dict) -> str:
    lines: list[str] = []

    bp = data.get('bloodPotency', 0)
    humanity = data.get('humanity', 0)
    if bp or humanity:
        parts = []
        if bp:
            parts.append(f'Blood Potency {_dots_str(bp)}')
        if humanity:
            parts.append(f'Humanity {_dots_str(humanity)}')
        lines.append('  '.join(parts))
        lines.append('')

    # Attributes
    attrs = data.get('attributes', {})
    if attrs:
        lines.append('**Attributes**')
        groups = [
            ('Physical', ['strength', 'dexterity', 'stamina']),
            ('Social', ['charisma', 'manipulation', 'composure']),
            ('Mental', ['intelligence', 'wits', 'resolve']),
        ]
        for group_name, keys in groups:
            row = '  '.join(f'{k.title()} {_dots_str(attrs.get(k, 0))}' for k in keys)
            lines.append(f'*{group_name}:* {row}')
        lines.append('')

    # Notable skills (2+)
    skills = data.get('skills', {})
    notable = {k: v for k, v in skills.items() if v >= 2}
    if notable:
        lines.append('**Skills** *(2+ shown)*')
        lines.append('  '.join(f'{k.title()} {_dots_str(v)}' for k, v in sorted(notable.items(), key=lambda x: -x[1])))
        lines.append('')

    # Disciplines grouped by discipline name
    disciplines = data.get('disciplines', [])
    if disciplines:
        lines.append('**Disciplines**')
        by_disc: dict[str, list[tuple[int, str]]] = {}
        for p in disciplines:
            disc = (p.get('discipline') or '').title() or 'Unknown'
            by_disc.setdefault(disc, []).append((p.get('level', 0), p.get('name', '?')))
        for disc in sorted(by_disc):
            powers = sorted(by_disc[disc])
            lines.append(f'*{disc}:* ' + ', '.join(f'{name} (L{lvl})' for lvl, name in powers))
        lines.append('')

    # Rituals and alchemy
    rituals = data.get('rituals', [])
    bs_rituals = [r for r in rituals if r.get('discipline', '').lower() == 'blood sorcery']
    alchemy = [r for r in rituals if r.get('discipline', '').lower() == 'thin-blood alchemy']
    other_rituals = [r for r in rituals if r not in bs_rituals and r not in alchemy]

    if bs_rituals:
        lines.append('**Blood Sorcery Rituals**')
        lines.append(', '.join(f'{r["name"]} (L{r.get("level", "?")})' for r in sorted(bs_rituals, key=lambda r: r.get('level', 0))))
        lines.append('')
    if alchemy:
        lines.append('**Thin-Blood Alchemy**')
        lines.append(', '.join(f'{r["name"]} (L{r.get("level", "?")})' for r in sorted(alchemy, key=lambda r: r.get('level', 0))))
        lines.append('')
    if other_rituals:
        lines.append('**Ceremonies**')
        lines.append(', '.join(f'{r["name"]} (L{r.get("level", "?")})' for r in sorted(other_rituals, key=lambda r: r.get('level', 0))))
        lines.append('')

    # Merits & Flaws (schema v7+ keeps Backgrounds in a separate array)
    merits = data.get('merits', []) + data.get('backgrounds', [])
    flaws = data.get('flaws', [])
    if merits:
        lines.append('**Merits & Backgrounds:** ' + ', '.join(f'{m["name"]} {_dots_str(m.get("level", 0))}' for m in merits))
    if flaws:
        lines.append('**Flaws:** ' + ', '.join(f'{f["name"]} {_dots_str(f.get("level", 0))}' for f in flaws))
    if merits or flaws:
        lines.append('')

    return '\n'.join(lines).rstrip()


def _update_wiki_stats_section(page, data: dict) -> None:
    stats_md = _generate_stats_markdown(data)
    new_section = f'{_SHEET_MARKER_START}\n{stats_md}\n{_SHEET_MARKER_END}'

    body = page.body_markdown or ''
    if _SHEET_MARKER_START in body and _SHEET_MARKER_END in body:
        start = body.index(_SHEET_MARKER_START)
        end = body.index(_SHEET_MARKER_END) + len(_SHEET_MARKER_END)
        page.body_markdown = body[:start] + new_section + body[end:]
    else:
        page.body_markdown = (body.rstrip() + '\n\n' + new_section) if body.strip() else new_section
