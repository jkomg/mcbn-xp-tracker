## Context

See proposal.md - Why/Impact. This touches the shared spend-category enum (`packages/api-contract`), the player spend-request form and its validation (`apps/web/app/blueprints/player.py`), the sheet patch/reverse-patch logic (`apps/web/app/character_sheet.py`), and staff review templates — the same set of layers the recent Status sub-category work (issue #386) touched, and that precedent is the primary reference for this design rather than inventing a new pattern.

Skill specialties are stored today as `character_data['skill_specialties']: {skill_name: [spec, ...]}` (display-only, from PR #262/#265). Backgrounds/Disciplines/Advantages already flow through one spend-request pipeline: web form → `submit_spend` validation → staff review (`spends.py`) → `_apply_patch` on approval / reverse-patch on reversal, all keyed by `spend_category` + `trait_name` (+ `power_name` for Discipline power names and, since #386, Advantage sub-categories).

## Goals / Non-Goals

**Goals:**
- Reuse the existing spend-request pipeline and its patch/reverse-patch/staleness-guard machinery as-is; no new submission path, no new DB table.
- Reuse the existing per-dot XP cost engine rather than inventing a flat-cost code path.

**Non-Goals:**
- Retroactively linking specialties imported via RoD/CC to this new write path (they already land directly in `skill_specialties` via the importer; unaffected).
- Any change to how specialties are displayed (PR #262/#265 stands as-is).
- Wish-list support for Skill Specialty (out of scope; can follow the same pattern later if wanted).

## Decisions

**Model the purchase as the existing "flat 0→1" cost type, not a new cost type.** `packages/rules/xp_costs.json` already has exactly this shape for `New Skill` (`"flat_cost": 3, "min_dots": 0, "max_dots": 1`) and `Ghoul Discipline`. Add `Skill Specialty` with `"flat_cost": 3, "min_dots": 0, "max_dots": 1`: `new_dots=1, current_dots=0` yields 3 XP through the existing cost formula, with zero new cost-calculation code. The dots inputs are hidden client-side for this category (nothing for the player to choose) but still submitted as 0/1 under the hood so the existing `DbSpendRequest` schema and cost engine need no changes.

**Reuse `power_name` for the specialty name, gated by category instead of by trait name.** Discipline power names and (since #386) Advantage sub-categories already share this column, disambiguated in staff review by `subcategory_label_for_trait`, which is keyed off a small fixed trait-name set (`_SUBCATEGORY_ADVANTAGES`). Skill Specialty's "trait" is the skill name, which varies freely (Firearms, Persuasion, ...), so the disambiguation trigger here is `spend_category == 'Skill Specialty'` directly rather than a trait-name lookup — simpler than the Advantage case, and consistent with the existing "category is already known and unambiguous" check used elsewhere in `spends.py`. Staff review shows a distinct label (e.g. "Specialty: Quickdraw") for this category, same mechanism, new branch.

**Validate the skill-rating gate and duplicate-name check server-side in `submit_spend`, reading the character's current sheet.** Mirrors how the Status/Advantage required-field gate was added in #386 (PR #388) — validation lives in `player.py` alongside the other category-specific checks, not in the shared patch logic (which stays a pure "apply this already-validated change" function, consistent with its existing role for every other category).

**Staff direct-edit is a separate, ungated write, not a zero-cost spend request.** A staff correction shouldn't create an approvable/reversible spend-request row (there's nothing to approve — it's already staff-authored) or touch the XP ledger. It writes directly to `character_data['skill_specialties']` from the existing staff sheet-edit surface, the same trust tier and pattern as other direct staff sheet edits, with an audit-log entry per this repo's DB-write convention (see `docs/ARCHITECTURE_WEB.md`'s audit-logging pairing rule).

## Risks / Trade-offs

- [`power_name` becomes a third overloaded meaning (discipline power / Advantage faction / specialty name)] → Mitigated by keeping disambiguation entirely server/template-side (category-driven label), same as the existing two meanings already coexist without confusion in staff review.
- [Server-side "skill rated ≥ 1" check needs a reliable read of the character's *current approved* sheet state at submission time, not just what the client-side autofill saw] → Read from the same sheet-state source `_apply_patch`/autofill already use, not a client-supplied value, so a stale or tampered client value can't bypass the gate.
- [Staff direct-edit bypassing the spend pipeline means no XP is deducted even if a staff member manually adds a "purchased-style" specialty] → Accepted: this mirrors how other direct staff sheet corrections already work (e.g. background blanking, roster field edits) and is a documented administrative capability, not a player-facing purchase shortcut.

## Migration Plan

Additive only: new spend category value, new `_apply_patch`/reverse-patch branch, new staff-edit control. No schema migration (reuses existing `DbSpendRequest.power_name` and `character_data['skill_specialties']`, which already exists from PR #262/#265). No backfill needed. Standard PR review/deploy, no feature flag required given the additive scope.
