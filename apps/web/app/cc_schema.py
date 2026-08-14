"""Character-creator schema version awareness.

The creator has always versioned its character_data (schemaVersion in
apps/character-app/src/data/Character.ts, with a patchVnToVn+1Compatibility
chain), but the web app never read that version — it absorbed schema changes
purely through defensive dual-array reads, e.g. checking both `merits` and
`backgrounds` after the v7 split. That works only as long as every future
change happens to be backward-tolerable, and gives staff no signal that a
draft predates a rules change.

This module reads the version so the two sides can disagree loudly instead of
silently. It deliberately does NOT migrate: the creator owns the migration
chain, and a draft is upgraded when the player next opens it. The web app's
job is to know which version it is looking at.
"""
from .shared_contract import load_json

_CC_SCHEMA = load_json('packages/api-contract/cc_schema.json')

CURRENT_SCHEMA_VERSION: int = _CC_SCHEMA['current_version']
MINIMUM_SUPPORTED_VERSION: int = _CC_SCHEMA['minimum_supported_version']
SCHEMA_HISTORY: dict[str, str] = _CC_SCHEMA.get('history', {})


def draft_schema_version(character_data: dict | None) -> int | None:
    """Version stamped on a draft, or None if absent/unparseable.

    None means "written before versioning was read here", not "version 0" —
    callers should treat it as unknown rather than ancient.
    """
    if not isinstance(character_data, dict):
        return None
    raw = character_data.get('version')
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def is_outdated(character_data: dict | None) -> bool:
    """True if the draft was written against an older schema than the creator
    currently emits. Unknown versions count as outdated — a draft with no
    version predates v2 stamping and is certainly behind."""
    version = draft_schema_version(character_data)
    if version is None:
        return True
    return version < CURRENT_SCHEMA_VERSION


def schema_changes_since(character_data: dict | None) -> list[str]:
    """Human-readable list of schema changes a draft has not been through yet.

    Used to tell staff *what* is different about an old draft rather than just
    that it is old — e.g. a pre-v8 draft has no persisted creation-XP baseline,
    so its banked-XP figure counts loresheets only.
    """
    version = draft_schema_version(character_data)
    if version is None:
        version = MINIMUM_SUPPORTED_VERSION - 1
    changes = []
    for raw_version, description in sorted(SCHEMA_HISTORY.items(), key=lambda kv: int(kv[0])):
        if int(raw_version) > version:
            changes.append(f'v{raw_version}: {description}')
    return changes
