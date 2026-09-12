## 1. Shared cost/category config

- [x] 1.1 Add `Skill Specialty` to `packages/api-contract/spend_categories.json`
- [x] 1.2 Add `Skill Specialty` to `packages/rules/xp_costs.json` with `"flat_cost": 3, "min_dots": 0, "max_dots": 1"`, matching the existing `New Skill` entry's shape

## 2. Backend: validation

- [x] 2.1 In `apps/web/app/blueprints/player.py`'s `submit_spend`, add a `Skill Specialty` branch: require `trait_name` (the skill) to be rated ≥ 1 on the character's current sheet, require a non-blank specialty name in `power_name`, and reject if that specialty name already exists for that skill
- [x] 2.2 SKIPPED — proposal's Non-Goals explicitly marks wish-list support for Skill Specialty out of scope for this change; no product-owner confirmation requested to add it now

## 3. Backend: sheet patch / reverse-patch

- [x] 3.1 Add a `Skill Specialty` branch to `_apply_patch` in `apps/web/app/character_sheet.py` that appends the specialty name to `character_data['skill_specialties'][skill_name]`
- [x] 3.2 Add the matching branch to the reverse-patch path, guarded by the existing staleness check (only remove if the specialty is still present exactly as this spend added it)
- [x] 3.3 Unit tests in `apps/web/tests/test_character_sheet_patch.py` covering: apply adds the specialty; reverse removes it; reverse is a no-op if the sheet no longer matches (staleness guard); duplicate specialty on the same skill is rejected at the patch layer as a defense-in-depth check — 16 new tests (patch/reverse-patch + `character_skill_rating`/`character_has_specialty` helpers)

## 4. Backend: staff direct edit

- [x] 4.1 Add a staff-only route (or extend the existing roster/sheet-edit route) to add/remove a `skill_specialties` entry directly on `character_data`, with no XP charge and no spend-request row created — `roster.edit_skill_specialty`
- [x] 4.2 Add an audit-log entry on this write, matching this repo's DB-write/audit-log pairing convention — `staff_skill_specialty_edit` via `db_service.log_action`
- [x] 4.3 Reject duplicate specialty names on add, same rule as the player-facing path
- [x] 4.4 Tests for the new route: add succeeds, remove succeeds, duplicate add is rejected, non-staff request is rejected — `tests/test_roster_skill_specialty_edit.py`, 7 tests

## 5. Staff review display

- [x] 5.1 In `apps/web/app/blueprints/spends.py`, extend the existing category-driven label logic (the mechanism added for Advantage sub-categories) to show a distinct "Specialty: <name>" label for `Skill Specialty` spends in `pending()` and `review()` — implemented in `subcategory_label_for_trait` (character_sheet.py), which both `pending()`/`review()` already call with `(trait_name, spend_category)`; no blueprint changes needed
- [x] 5.2 Update `apps/web/app/templates/spends/pending.html` and `review.html` if the label rendering needs a new branch beyond what's already generic — confirmed not needed, existing `{% if power_name_label %}` rendering is fully generic
- [x] 5.3 Tests for the label helper covering the new category — `test_subcategory_label_for_trait_specialty_for_skill_specialty_category`

## 6. Player-facing form

- [x] 6.1 Add `Skill Specialty` to the spend-category `<select>` — automatic, the select is populated from `spend_categories.json` (task 1.1), no template change needed
- [x] 6.2 When `Skill Specialty` is selected, constrain the trait/skill picker to skills the character has rated ≥ 1 (client-side convenience; server-side validation from task 2.1 is the real gate) — implemented via a `<datalist>` populated from `SHEET_DATA.skills`
- [x] 6.3 Show a specialty-name text input (reusing the existing `power_name` field/element, following the pattern established for Advantage sub-categories) — dots inputs are disabled+forced to 0/1 via the existing flat-cost XP_RULES branch (same mechanism already used for New Skill/Ghoul Discipline), not hidden — disabled inputs are correctly omitted from the POST body and player.py's `.get(..., default)` fills in 0/1 server-side
- [x] 6.4 Manual verification: JS brace/paren balance and element-ID consistency checked (matches this file's established verification pattern from the Status change); full interactive click-through still recommended before considering this fully done, since this repo has no JS test harness

## 7. Staff sheet-edit UI

- [x] 7.1 Add an inline add/remove control for `skill_specialties` to the roster/sheet-edit view, wired to the route from task 4.1 — `roster/edit_sheet.html`
- [x] 7.2 Manual verification in a browser (add, remove, duplicate rejection) — verified via isolated Jinja render (populated/empty/no-draft states) plus the 7 route-level tests in task 4.4; full interactive browser click-through still recommended before considering this fully done

## 8. Final checks

- [x] 8.1 Run `cd apps/web && pytest -q` and `ruff check app tests` — 374 passed, ruff clean
- [x] 8.2 Confirm no `apps/bot` changes are needed (spend submission is web-portal-only per existing architecture) — confirmed; only touched `xp_costs.json`-derived tests, full bot `npm run check` (352 tests, lint/format/typecheck/build) passes with no source changes needed
