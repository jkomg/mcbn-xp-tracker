## Prerequisite

Depends on **#440** (merged 2026-09-12), which removed
`approve_donation`'s `bg.dots_blanked = bg.dots_total`. Until that landed, a
donated background was fully blanked with no releasing night — a state this
change cannot represent, and the reason an earlier draft modelled an indefinite
hold. Group 2 assumes donation no longer touches blank state, which is only true
on top of that fix.

## Release scope

This change is **release 1 of three** (see 1.9 and design.md). Groups 1–4 and 6
are release 1: the table, the dual-write, release-from-rows, and closeout.

**Groups 5 and the derived properties are release 2**, raised as their own change,
because both require *reading* from the rows — which is the step that cannot ship
alongside the write change without losing the old revision's writes during
cutover. They are specified here so release 2 is not designed from scratch, and
the items below say which release they belong to where it is not obvious.

Release 3 is the contract: drop the index and the three columns.

## Ownership

Annotated per `docs/CODEX_TASK_BRIEF.md`. Groups 1–3 carry the schema, the
migration and the release semantics and stay with the session holding the
context — `AGENTS.md` names migrations as not-delegated.

Release 1's groups are ordered 1 → 2 → 3 → 4 → 6. Group 5 is bounded display work
and belongs to release 2, where it is delegable.

## 1. Schema

*Seam: `apps/web` Python — owner: primary session*

- [ ] 1.1 Add `DbCharacterBackgroundBlank` to `apps/web/app/db.py`: FK to
      `character_backgrounds`, `dots`, `blanked_at_night_number`,
      `release_night_number` (always set — every blank returns), `released_at`
      (null while outstanding), indexed on the FK and on `release_night_number`
- [ ] 1.2 Add an `outstanding_blanks` relationship on `DbCharacterBackground`,
      declared `lazy='selectin'` so neither the dual-write helper nor release 2's
      derived properties issue a query per background
- [ ] 1.3 **Keep** the three columns mapped and keep reading them — release 1 does
      not switch reads, see 1.9. `dots_available` goes on reading `dots_blanked`
      unchanged. The derived properties (sum of outstanding lots; earliest
      releasing night; no setters, so an assignment raises rather than silently
      doing nothing) are **release 2**, specified in its own change
- [ ] 1.4 Migration, two steps, both guarded, **no drops**: create the table (skip
      if present); backfill one row per background with `dots_blanked > 0`. The
      index and columns stay — 1.9 explains why
- [ ] 1.4a The backfill needs **two** guards, for two different cases. Skip it
      entirely if the legacy columns are absent: on a fresh database
      `create_all()` builds `character_backgrounds` from the post-change model,
      so they never exist and referencing them aborts startup. And write it as one
      `INSERT ... SELECT ... WHERE NOT EXISTS` keyed per background, for the
      existing-database case where two instances boot together — multiple rows per
      background are legitimate so nothing catches a duplicate. A duplicated lot
      makes the dual-written total wrong immediately in release 1, and the derived
      total wrong in release 2. "Skip if the table is empty" satisfies neither
- [ ] 1.5 **Do not put one table-exists guard over the whole upgrade.**
      `db.create_all()` runs before Alembic on every boot, so the table already
      exists on any database that has booted this code — a leading guard would
      skip the backfill too, so no outstanding blank would ever reach the table
      that release 2 starts reading from, and every blanked dot would quietly
      disappear the moment release 2 shipped
- [ ] 1.6 Make each DDL step tolerate losing a race, not merely check first. Two
      deployments can start together, both see the table absent, and the loser's
      `CREATE TABLE` then fails and takes startup down. Check *and* swallow the
      "already exists" failure. `fix/dedupe-key-migration-idempotency` exists
      because checking was not enough on its own
- [ ] 1.9 **This change is release 1 of three, and it neither switches reads nor
      drops anything.** `entrypoint.sh` runs `flask db upgrade` before
      `exec gunicorn`, so the schema changes while the previous Cloud Run revision
      is still serving. Dropping the columns breaks that revision's reads; merely
      unmapping them makes its *writes* vanish, because the backfill is a one-time
      snapshot and the new code stops reading the columns — a blank served during
      cutover would be silently discarded. So release 1 dual-writes and keeps
      reading columns; release 2 switches reads and unmaps; release 3 drops.
      Raise releases 2 and 3 as their own changes, each gated on the previous being
      live everywhere. When writing release 3, remember the index must be dropped
      **before** its column — SQLite fails with `error in index ... after drop
      column: no such column`
- [ ] 1.7 Write a real `downgrade()` — two guarded, retryable steps now that
      nothing is dropped on the way up: repopulate the legacy columns from the
      outstanding rows (sum, earliest releasing night), then drop
      `character_background_blanks` if present. The drop is not tidiness: leaving
      the table means old code edits the columns while stale rows remain, and a
      roll-forward skips its own backfill because rows already exist, so the new
      model would resume from pre-rollback data
- [ ] 1.8 Test on a database built at the previous revision holding a timed blank
      and a donated background: confirm re-running `upgrade()` is a no-op, that
      running it twice concurrently produces one row per background, and that
      `upgrade` → `downgrade` → `upgrade` round-trips without losing dots
- [ ] 1.8a A legacy row with `dots_blanked > 0` and **no** releasing
      night is *deliberately* cleared, not preserved — every blank now has a
      night, so it is unrepresentable. Assert it is cleared; do not include it in
      the round-trip-without-loss case, which it would contradict. Both databases
      hold zero such rows (read-only count), so this is a guard, not a data path

## 2. Blanking writes a row, and keeps the columns current

*Release 1 writes both representations. Every mutation below updates the blank
rows **and** recomputes the legacy columns from them — a temporary sync
obligation, deleted in release 2, which exists so the two cannot disagree during
the only window where both are read.*

*Seam: `apps/web` Python — owner: primary session. Depends on 1.*

- [ ] 2.1 `blank_character_background` inserts a blank row instead of merging
      into the background's columns, and stops auto-releasing an older due blank
- [ ] 2.1a **The insert carries its own bound** — one
      `INSERT ... SELECT ... WHERE (sum of outstanding) + :dots <= dots_total` —
      rather than checking availability and then inserting. Two members can blank
      the same donated background at once and both pass a prior check before
      either writes, pushing the outstanding total above the rating. A rowcount of
      0 is the existing "only N available" refusal. Test it by interleaving two
      reservations against a background with one dot left
- [ ] 2.2 Remove the interim earlier-release-wins rule added for the #434 P1 —
      there is nothing left to reconcile
- [ ] 2.3 Grep for every **direct assignment** to the three legacy columns and
      route it through 2.4's helper instead, so the rows are the thing being
      changed and the columns follow. Known sites: the coterie blank-everything
      path (`bg.dots_blanked = bg.dots_total`), the undonate and
      remove-member resets (`dots_blanked = 0`), `set_character_background`'s
      clamp, and the orphaned-background purchase transfer. **Release 1 has no
      safety net here** — the columns are still real and writable, so a missed site
      fails silently by leaving the rows and columns disagreeing. Grep carefully,
      and rely on 2.4a's invariant test to catch what the grep misses. Release 2
      gets the net: a property without a setter raises on assignment
- [ ] 2.4 Add `_sync_legacy_blank_columns(row)` as the **single** place the three
      legacy columns are written, called at the end of every mutation that touches
      blank rows: `dots_blanked` = sum of outstanding lots, the two nights from the
      earliest. Every existing direct assignment goes through it. Release 2 deletes
      this function and the calls
- [ ] 2.4a Test the invariant directly, not only through behaviour: after every
      mutation path, the legacy columns equal what the rows say. That is the
      property release 2 depends on being true before it stops backfilling
- [ ] 2.5 Tests: two blanks in different nights keep separate nights; blanking
      again never moves an outstanding night; over-blanking is refused counting
      every outstanding lot
- [ ] 2.6 **Ending a donation discards its lots.** `undonate_background` and
      `remove_member` currently set `dots_blanked = 0`; with rows they delete the
      background's outstanding lots instead, returning it to its owner at full
      rating. `approve_donation` needs nothing — it no longer touches blank state
      at all. Tests: a coterie blanks a donated background and the lot behaves
      normally; undonating with lots outstanding returns the background whole
- [ ] 2.7 **Rating reductions.** `set_character_background` clamps `dots_blanked`
      today, which stops meaning anything once the rows are authoritative — a clamp
      on the column would be undone by the next sync. Lowering a rating below what
      is outstanding reduces lots
      newest-first, preserving the earliest promised return. Tests: reduce below
      outstanding; reduce while still above it (no change); reduce to zero with
      lots outstanding

## 3. Release iterates rows

*Seam: `apps/web` Python — owner: primary session. Depends on 2.*

- [ ] 3.1 `release_due_background_blanks` iterates outstanding blank rows,
      applying `night_has_started` per row, holding a row whose night the
      calendar does not list
- [ ] 3.2 Mark released rows with `released_at` rather than deleting them, then
      recompute the total
- [ ] 3.3 Keep the existing return shape — one entry per background with an
      aggregated dot count — so the bot's notification and zod schema are
      unchanged
- [ ] 3.4 Tests: only the due lot releases; two lots due the same night release
      together and report as one entry; an unknown night is held; the #431
      calendar-gate cases still hold

## 4. Character rename and deletion

*Seam: `apps/web` Python — owner: primary session*

- [ ] 4.1 The new table keys off the background's id, not a character name, so
      `rename_character` needs no new entry — **verify that and say so**, since
      `AGENTS.md` calls out that list explicitly
- [ ] 4.2 Confirm deleting a background or a character leaves no orphaned blank
      rows; add cascade or explicit cleanup if it does

## 5. Showing more than one pending release

**Release 2, not release 1.** Rendering per-lot data means reading the rows, which
is the switch release 2 makes. Specified here so release 2 inherits the design.

*Seam: `apps/web` Jinja + blueprints — **delegable** once release 2 starts. No
schema, no new DB writes.*

- [ ] 5.0 **First**, extend `get_character_backgrounds` to carry the per-lot data.
      The player route hands the template plain dicts from that method, whose
      response is an aggregate plus one `release_night_number` — the template
      cannot enumerate lots it is never given. This also changes the
      `GET /api/backgrounds/status` payload, so it is the same task as 6.4's doc
      update and must land before 5.1 or 5.2 can work
- [ ] 5.1 `player/character.html` shows each outstanding lot's dots and
      releasing night rather than a single night
- [ ] 5.2 `coteries/view.html` does the same for donated backgrounds
- [ ] 5.3 `player.py` / `api.py` flash and response text name the lot just
      blanked and its night, without implying it is the only one
- [ ] 5.4 Route-level tests for one lot, two lots, and none

## 6. Close out

- [ ] 6.1 From `apps/web`: `./venv/bin/pytest -q --cov=app
      --cov-report=term-missing --cov-fail-under=30`,
      `./venv/bin/ruff check app tests`, `./venv/bin/python -m compileall app tests`
- [ ] 6.2 `CHANGELOG.md` — per-blank release tracking, and that the #434 interim
      rule is gone
- [ ] 6.3 Update `AGENTS.md`'s two-representations list. In release 1 backgrounds
      genuinely have **two** maintained representations and that is deliberate and
      temporary — say so, and say that release 2 removes the legacy one, so nobody
      reads the dual-write as the bug this list usually warns about. Release 2
      updates it again to record that `dots_blanked` is derived
- [ ] 6.4 `docs/API_ENDPOINTS.md` — `GET /api/backgrounds/status` now carries
      per-lot release data; the doc describes only a single release night
- [ ] 6.4a `docs/WEB_APP.md` (Backgrounds tab, ~line 182) tells players each row
      shows "the scheduled release night if blanked" — singular. After 5.1 it
      shows every outstanding lot
- [ ] 6.7 Raise **release 2** (switch reads to the rows, unmap the columns, delete
      the dual-write helper, plus group 5's display work) and **release 3** (drop
      the index and the three columns) as their own changes. Each is gated on the
      previous being live everywhere — release 2 must not ship until every serving
      revision is dual-writing, and release 3 not until none maps the columns
- [ ] 6.5 Retarget the staff view in `background-blanking-timing-and-dashboard`
      group 3 to query blank rows rather than `dots_blanked > 0`, which stops
      working as a class-level filter. Whichever change lands second carries it
- [ ] 6.6 Add the missing `log_action` to every route that writes authoritative
      blank state, not just the one that creates it:
      `blank_donated_background` (creates a lot), and `undonate_background` and
      `remove_member` (both **discard** outstanding lots, per 2.6). None of the
      three logs today. Discarding a player's blanked dots is at least as worth
      recording as taking them, and since this change makes the rows
      authoritative, shipping an unaudited delete of them would violate the
      convention `AGENTS.md` states. Not deferred
