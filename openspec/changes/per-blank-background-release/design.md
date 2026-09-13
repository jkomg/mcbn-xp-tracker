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
- A migration that is guarded per step and genuinely reversible, with a working
  downgrade rather than a stub.

**Non-Goals:**
- Changing blank duration, the calendar gate, or what blanking means in-game.
- Keeping the legacy columns. They are dropped; see the decision below.
- Presenting more than the totals plus per-lot release nights. No history of
  released blanks in the UI; keeping released rows makes it queryable if wanted.
  Note that `audit_log` does **not** currently cover this: `blank_donated_background`
  calls `blank_character_background` and flashes the result without a
  `log_action`, so the donated-background route has no audit trail today. Worth a
  separate fix, and not assumed here.

## Decisions

**One row per blank, in a new `character_background_blanks` table.** Columns:
the background FK, `dots`, `blanked_at_night_number`, `release_night_number`,
and `released_at` (null while outstanding). Keeping released rows rather than
deleting them costs nothing and makes "why did these dots come back" answerable;
outstanding is simply `released_at IS NULL`.

**Derive `dots_blanked` from the blank rows and drop the three legacy columns.**
The blanks table is the only place that knows what is blanked; nothing should be
able to disagree with it. `dots_blanked` becomes a Python property summing
outstanding rows, exactly as `dots_available` already is — which is why the two
templates, `get_character_backgrounds`'s response dict, and therefore the bot's
schemas all keep working unchanged. `blanked_at_night_number` and
`release_night_number` go the same way: properties reporting the earliest
outstanding blank, which is what "when do I next get dots back" means and is the
one question a single value can still answer honestly.

An earlier draft kept `dots_blanked` as a maintained denormalized column. Both
reasons given for that were wrong, and they are recorded here because the second
nearly became a rule:

- *"A property cannot be used in a SQL filter or index, and the release query
  needs one."* It does not. With per-blank rows the release query selects from
  `character_background_blanks` — `WHERE released_at IS NULL AND
  release_night_number <= :n` — that table's own indexed column. The staff view
  the same. The argument was reasoning from the pre-change query shape. Nothing
  filters or sorts *backgrounds* by `dots_blanked` in SQL.
- *"Dropping a column from a table referenced by a foreign key fails on
  SQLite/Turso."* It does not. That failure was real but specific: it happened
  dropping `purchased_background_id` from `spend_requests`, where the column
  appeared in that table's **own** foreign-key definition. A plain integer on a
  referenced table is fine. Verified three ways on 2026-09-12 — raw SQLite
  3.53.4; Alembic's `op.drop_column`, which emits native `DROP COLUMN` and leaves
  the referencing table's FK intact rather than falling back to a table recreate;
  and against the **dev Turso database itself** through a throwaway parent/child
  pair, where the drop succeeded with the FK present and the child row untouched.

What decides it is the cost of being wrong in each direction. A denormalized
total is an unenforced pairing, which is this repository's dominant bug class —
the first item in its own regression-hygiene checklist, and the shape of the
audit-log convention, `rename_character`'s table list, and the duplicated
activity filters found in `index()` on 2026-09-12. Drift there would silently
show a player the wrong number of dots while they decide whether to blank more.
A derived value cannot drift. That is worth more than the convenience of keeping
a column.

**N+1 is handled by the loader, not by denormalization.** A property summing a
lazy relationship would issue one query per background. The relationship is
declared `lazy='selectin'`, so loading a character's backgrounds batches their
blanks into one additional query regardless of how many there are.

**Every blank has a releasing night; there is no hold case.** An earlier draft
made `release_night_number` nullable, with null meaning an indefinite hold, to
represent a donated background. That read `approve_donation`'s
`dots_blanked = dots_total` as deliberate semantics. It was not: the assignment
drove `dots_available` to 0, which hid the coterie's Blank control and made
`blank_character_background` refuse, so the donated-blanking mechanic was
unreachable. Removing it was a separate bug fix. Donation now sets
`donated_coterie_id` and leaves the dots spendable, so a donated background's
blanks are ordinary timed lots and the model needs no second kind of row.

Recorded because the nullable design was not wrong in itself — it was a faithful
model of the wrong premise, reached by treating an existing assignment as an
intent. The cheaper check was asking what donation is *for*.

**Release iterates blank rows, applying `night_has_started` per row.** The #431
gate moves down a level unchanged, including holding a row whose night the
calendar does not know. The existing `release_due_background_blanks` return
shape — one entry per background with a dot count — is kept, aggregating the
rows released in that pass, so the bot's notification and its zod schema need no
change. A background with two lots releasing on the same night yields one
notification, which is what a player wants.

**The staff view planned in `background-blanking-timing-and-dashboard` must be
retargeted.** That change's group 3 specifies a route filtering
`DbCharacterBackground.dots_blanked > 0`. Once `dots_blanked` is a property that
class-level filter no longer exists, so the view queries outstanding blank rows
joined to their backgrounds instead — which is the better query anyway, since it
can show each lot. Whichever of the two changes lands second carries the fix;
recorded in tasks.md so it is not discovered at implementation time.

**Blanking no longer auto-releases anything.** The current code releases an
older due blank inline before stacking, because one row could not hold both.
With per-blank rows there is nothing to reconcile, so that branch goes away
along with the interim earlier-release-wins rule from #434. Release happens in
one place — the worker — which is a real simplification and removes the second
release path that had to be gated separately.

## Risks / Trade-offs

- [Dropping columns makes a bare code revert fail — old code reads columns that
  no longer exist] → True, and already true of every migration here: the
  entrypoint only ever runs `upgrade`, so reverting any schema change needs a
  deliberate downgrade rather than just reverting the commit. The migration ships
  with a working `downgrade()` that recreates the three columns and repopulates
  them from the blank rows, so the path exists and is tested.
- [Three properties replace three columns, so any code that *assigns* to them
  now fails] → Deliberate: an assignment is exactly the bug this removes. The
  grep in group 2 finds all of them (the coterie blank-everything and undonate
  paths), and a property without a setter raises rather than silently doing
  nothing.
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

Four steps in one migration, **each guarded independently**:

1. Create `character_background_blanks` — skip if the table exists.
2. Backfill one row per background with `dots_blanked > 0`, carrying its existing
   two nights. **Written as a single `INSERT ... SELECT ... WHERE NOT EXISTS`
   keyed per background, not guarded by "is the table empty".** Two Cloud Run
   instances can boot at once and both observe an empty table before either
   inserts, and multiple rows per background are legitimate so no unique
   constraint would catch the duplicate — each background would end up with its
   blank counted twice, and `dots_blanked` being derived means the player
   immediately sees double. A per-background `NOT EXISTS` is correct however many
   times it runs and however many run at once. This repo has already been bitten
   by a concurrent-migration race once, in `fix/dedupe-key-migration-idempotency`.
   A row with `dots_blanked > 0` but **no** releasing night cannot be represented
   — every blank now returns — and the only thing that produced one was the
   donation bug fixed separately, which no longer does. Such a row is cleared
   rather than backfilled, which is what undonating it would have done anyway.
   Both databases currently hold zero of them, verified by read-only count, so
   this is a guard rather than a data path.
3. Drop `ix_character_backgrounds_release_night`.
4. Drop the three columns — each skipped if already absent.

**The guards must be per step, not one guard over the whole upgrade.** This is
the `db.create_all()` trap in a new shape: `create_all` runs before Alembic on
every boot, so against any database that has booted on this code the table
already exists. A single leading `if table exists: return` would skip the
backfill too, and every outstanding blank in production would vanish silently —
the columns dropped on a later run with nothing carried across. Step 2 keys off
whether blank *rows* exist, not whether the table does.

**Step 3 is not optional.** SQLite refuses to drop a column an index still
references: dropping `release_night_number` with
`ix_character_backgrounds_release_night` present fails with `error in index
ix_character_backgrounds_release_night after drop column: no such column`.
Verified 2026-09-12. The index is declared in both `db.py` and migration
`6d2a4f0be9c1`.

`downgrade()` is written and tested, not left as a stub, and its order matters:

1. Re-add the three columns, **each behind its own column-exists guard.** If
   Turso persists one `ADD COLUMN` and the downgrade then fails before Alembic
   writes the revision back, an unguarded retry dies on the column it already
   added — leaving the database stuck between revisions, which is the worst place
   for it to be.
2. Repopulate them from the outstanding rows — sum for `dots_blanked`, earliest
   releasing night for the other two.
3. Recreate `ix_character_backgrounds_release_night`. **After** step 1, not
   before: SQLite cannot index a column that does not exist yet.
4. **Drop `character_background_blanks`.**

Step 4 is not tidiness. Leaving the table behind means old code then changes
blank state in the legacy columns while stale rows sit in the blanks table, and a
roll-forward re-runs `upgrade()` — whose backfill skips precisely because blank
rows already exist. The new model would start from the stale pre-rollback rows
and silently contradict the columns. Dropping the table makes the roll-forward
backfill from the only representation that was being maintained.

Reverting means running that downgrade, not merely reverting the commit, and the
difference matters more here than usual. Reverting code alone leaves the old
worker clearing `dots_blanked` wholesale at the earliest release while the new
rows stay outstanding, and any blank taken during the rollback writes only the
legacy columns — so the two representations diverge in both directions. The
downgrade collapses the rows first, which is the only ordering that keeps them
coherent. That `entrypoint.sh` only ever runs `upgrade` is precisely why this has
to be a deliberate step rather than an assumed one.

Turso supports `ALTER TABLE ... DROP COLUMN`, verified against the dev database
rather than assumed. Deploy is ordinary, and the web change stands alone: the
bot's payload shape is unchanged by design, so nothing has to ship in the other
repo.

Deploy is ordinary, and the web change stands alone: the bot's payload shape is
unchanged by design, so nothing has to ship in the other repo.
