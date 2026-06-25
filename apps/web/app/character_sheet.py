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


def _do_patch(spend) -> bool:
    from app.db import db, CharacterDraft, DbCharacter, WikiPage
    from sqlalchemy import func

    # Resolve roster character → draft
    char_row = DbCharacter.query.filter(
        func.lower(DbCharacter.character_name) == spend.character_name.lower()
    ).first()
    if not char_row:
        return False

    draft = CharacterDraft.query.filter_by(
        roster_character_id=char_row.id,
        status='approved',
    ).first()
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
        merits = data.setdefault('merits', [])
        for m in merits:
            if m.get('name', '').lower() == trait_name.lower():
                m['level'] = new_dots
                return True
        merits.append({
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

    # Merits & Flaws
    merits = data.get('merits', [])
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
