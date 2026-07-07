"""Character sheet patching: apply approved spends to CharacterDraft.character_data.

Called after spend approval to keep the living character sheet up to date.
Also updates the character's wiki page body with a regenerated stats section.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_DISCIPLINE_CATEGORIES = frozenset({
    'Discipline (In-Clan)',
    'Discipline (Out-of-Clan)',
    'Caitiff Discipline',
    'Ghoul Discipline',
})

_SKILL_CATEGORIES = frozenset({'Skill', 'New Skill'})

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
        return json.loads(draft.character_data)
    except (json.JSONDecodeError, TypeError):
        return None


def find_trait_sheet_match(character_name: str, category: str, trait_name: str) -> dict | None:
    """Check a pending spend's trait name against the character's current sheet.

    Only meaningful for 'Advantage (Merit/Background)': these are the traits
    that can carry a parenthetical source (e.g. "Status (Tremere)"), so a
    spend submitted as plain "Status" can silently miss an existing entry and
    create a stray duplicate instead of raising it — the bug that hit Marcus.

    Returns None if there's nothing to check (wrong category, no sheet, blank
    trait name). Otherwise returns {'exact': bool, 'close_matches': [...]} —
    close_matches lists existing entries whose name starts with trait_name
    but isn't an exact match, e.g. trait_name="Status" surfaces an existing
    "Status (Tremere)" entry as a likely-intended match.
    """
    if category != 'Advantage (Merit/Background)':
        return None
    trait_name = (trait_name or '').strip()
    if not trait_name:
        return None

    data = _load_approved_sheet_data(character_name)
    if data is None:
        return None

    key = trait_name.lower()
    entries = list(data.get('backgrounds') or []) + list(data.get('merits') or [])
    exact = any((e.get('name') or '').lower() == key for e in entries)
    close_matches = [
        {'name': e.get('name', ''), 'level': e.get('level', 0)}
        for e in entries
        if (e.get('name') or '').lower() != key and (e.get('name') or '').lower().startswith(key)
    ]
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
        key = trait_name.lower()
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
            'name': trait_name,
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

    if category == 'Humanity':
        data['humanity'] = new_dots
        return True

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
