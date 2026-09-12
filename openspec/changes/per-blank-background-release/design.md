## Context

See proposal.md. Blanking works across four layers today:
`character_backgrounds` carries `dots_blanked`, `blanked_at_night_number` and
`release_night_number`; `db_service.blank_character_background` stamps the
release night via `game_calendar.next_night_after_downtime`;
`release_due_background_blanks` returns what is due, gated since #431 on
`night_has_started`; and the bot polls `POST /api/backgrounds/release-due` every
two minutes to notify the player's cubby.

The defect is the three columns. They describe one blank, and a player can hold
two at once with different release nights. Every rule for reconciling that into
one column is wrong somewhere: overwriting pushes a held blank out (the Codex P1
on #434), and keeping the earlier night brings the new one forward, which lets
one dot blanked early in a night carry three more blanked just before the
release.

`dots_blanked` is read far more widely than the other two:
`player/character.html`, `coteries/view.html`, `get_character_backgrounds`'s API
response, the bot's `types.ts` and `adapter.ts` schemas, and the
`dots_available` property every blanking control is bounded by. That breadth is
the main constraint on this design.

## Goals / Non-Goals

**Goals:**
- One row per act of blanking, each with its own releasing night, so neither rule
  above has to be chosen.
- Keep every existing display and API consumer working.
- A migration that is additive and reversible, per this repo's guards.

**Non-Goals:**
- Changing blank duration, the calendar gate, or what blanking means in-game.
- Dropping the legacy columns. See the decision below.
- Presenting more than the totals plus per-lot release nights. No history of
  released blanks — that is an audit concern, and `audit_log` already records
  each blank and release.

## Decisions

**One row per blank, in a new `character_background_blanks` table.** Columns:
the background FK, `dots`, `blanked_at_night_number`, `release_night_number`,
and `released_at` (null while outstanding). Keeping released rows rather than
deleting them costs nothing and makes "why did these dots come back" answerable;
outstanding is simply `released_at IS NULL`.

**Keep `dots_blanked` as a denormalized total, maintained in one place.** The
tempting alternative is deleting the column and making `dots_blanked` a Python
property summing outstanding rows — `dots_available` is already a property, so
both templates and the API response would keep working untouched. It was
rejected for two reasons. First, a property cannot be used in a SQL filter or
index, and `release_due_background_blanks` and the new staff view both want to
query for outstanding blanks. Second, dropping columns on SQLite/Turso is
genuinely hazardous: an `ALTER TABLE ... DROP COLUMN` against a table referenced
by a foreign key fails with `unknown column in foreign key definition`, which
this repo hit while testing a migration on 2026-09-12. A maintained total keeps
the migration purely additive.

The cost is a sync obligation, which is the pairing hazard this codebase warns
about. It is contained by giving the total exactly one writer: a
`_recompute_blanked_total(row)` helper called at the end of every mutation that
touches blanks, and nowhere else assigning `dots_blanked`. That is the same
shape as the audit-log pairing convention — a rule rather than a type — so the
tests assert the invariant directly (total always equals the sum of outstanding
rows) rather than only testing behaviour through it.

**The legacy `blanked_at_night_number` and `release_night_number` become
display-only, set to the earliest outstanding blank's values.** They stay
populated so the existing templates, API response and bot schemas keep rendering
something truthful during and after the transition, and because "when do I get
dots back next" is the question a single field can still answer correctly. The
new table is authoritative; these are a view of it.

**Release iterates blank rows, applying `night_has_started` per row.** The #431
gate moves down a level unchanged, including holding a row whose night the
calendar does not know. The existing `release_due_background_blanks` return
shape — one entry per background with a dot count — is kept, aggregating the
rows released in that pass, so the bot's notification and its zod schema need no
change. A background with two lots releasing on the same night yields one
notification, which is what a player wants.

**Blanking no longer auto-releases anything.** The current code releases an
older due blank inline before stacking, because one row could not hold both.
With per-blank rows there is nothing to reconcile, so that branch goes away
along with the interim earlier-release-wins rule from #434. Release happens in
one place — the worker — which is a real simplification and removes the second
release path that had to be gated separately.

## Risks / Trade-offs

- [A denormalized total can drift from the rows] → One writer, and a test
  asserting the invariant after every mutation path. A reconciliation check could
  be added to the nightly job later if drift is ever observed.
- [Migration backfill must be exactly right or players lose or gain dots] →
  Backfill is mechanical: one row per background with `dots_blanked > 0`,
  carrying its existing two nights. Tested against a fixture database including
  a background mid-blank, and the guards make re-running it a no-op.
- [Blanking the same background twice in one night now creates two rows that
  release together] → Harmless, and more truthful than merging them. The release
  aggregates per background, so the player still sees one notification.
- [The legacy columns being display-only invites someone writing to them
  directly] → Named in `AGENTS.md`'s two-representations list, which already
  carries exactly this class of trap.

## Migration Plan

Additive: create the table with a table-exists guard, backfill from the existing
columns, leave the columns in place. No column drops, so no SQLite hazard. A
rollback is reverting the code — the legacy columns remain correct for the
single-blank case, and any background with two outstanding blanks reverts to
showing the earliest release, which is the #434 interim behaviour rather than
anything new.

Deploy is ordinary, and the web change stands alone: the bot's payload shape is
unchanged by design, so nothing has to ship in the other repo.
