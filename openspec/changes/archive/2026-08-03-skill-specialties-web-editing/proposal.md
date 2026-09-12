## Why

Skill specialties currently only enter a character sheet via RoD/CC import — display was added in PR #262/#265, but there is no way for a player to add a specialty after character creation, or for staff to correct one. Since Skill Specialty is a purchasable trait in V5 (3 XP), players who want to buy one post-creation currently have no path to do so at all.

## What Changes

- Add Skill Specialty as a purchasable trait via the existing player spend-request flow (same form/review/approval pipeline as Backgrounds/Disciplines/Advantages — no new submission path), fixed at 3 XP per specialty, gated to skills the character already has rated ≥ 1.
- Extend `_apply_patch` (and its reverse) in `character_sheet.py` to append/remove entries in `character_data['skill_specialties'][skill_name]` on approval/reversal, mirroring the existing per-category branches.
- Add a staff-facing edit control on the roster/sheet edit view to add or remove specialties directly (no XP charge, corrective/administrative — same trust tier as existing staff sheet-edit fields).
- No change to the existing display logic (PR #262/#265) — this only adds the write paths.

## Capabilities

### New Capabilities
- `skill-specialty-editing`: player XP-spend purchase of a skill specialty (gated on skill rating ≥ 1) and staff direct edit of a character's `skill_specialties`, both writing to the existing `skill_specialties` character-sheet field.

### Modified Capabilities
(none — no existing spec files predate this change; the spend-request pipeline and `_apply_patch` are implementation, not a previously-specified capability)

## Impact

- `apps/web/app/templates/player/character.html` — spend-request form gains a Skill Specialty category option; the trait-name input becomes a skill picker constrained to skills rated ≥ 1, plus a specialty-name text field.
- `apps/web/app/blueprints/player.py` — validation for the new category (skill must exist on the sheet at ≥ 1, specialty name required, reject duplicate specialty names for the same skill).
- `apps/web/app/character_sheet.py` — `_apply_patch`/reverse-patch gain a Skill Specialty branch operating on `character_data['skill_specialties']`.
- `apps/web/app/blueprints/spends.py` and `spends/{pending,review}.html` — display the skill + specialty name for this category (same pattern as Discipline's power_name / Advantage's Faction-Group field from the recent Status change).
- `apps/web/app/templates/roster` sheet-edit view (staff) — new inline add/remove control for `skill_specialties`, no XP cost.
- `packages/api-contract/spend_categories.json` — add the new category value, consumed by both web and bot.
- No bot-side (`apps/bot`) changes expected — the bot has no spend-submission UI of its own (spends route through the web portal only, per existing architecture).
