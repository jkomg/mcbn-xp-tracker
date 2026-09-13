## Ownership

Annotated per `docs/CODEX_TASK_BRIEF.md`. Groups 1–3 carry the schema, the
migration and the release semantics and stay with the session holding the
context — `AGENTS.md` names migrations as not-delegated. Group 5 is bounded
display work and is delegable once 1–3 have landed.

Groups are ordered 1 → 2 → 3 → 4, with 5 after 3.

## 1. Schema

*Seam: `apps/web` Python — owner: primary session*

- [ ] 1.1 Add `DbCharacterBackgroundBlank` to `apps/web/app/db.py`: FK to
      `character_backgrounds`, `dots`, `blanked_at_night_number`,
      `release_night_number` (always set — every blank returns), `released_at`
      (null while outstanding), indexed on the FK and on `release_night_number`
- [ ] 1.2 Add an `outstanding_blanks` relationship on `DbCharacterBackground`,
      declared `lazy='selectin'` so the derived properties below do not issue a
      query per background
- [ ] 1.3 Replace `dots_blanked`, `blanked_at_night_number` and
      `release_night_number` with properties derived from the outstanding blanks
      — sum for the first, earliest for the other two. No setters: an assignment
      should raise rather than silently do nothing. `dots_available` keeps
      working as-is since it reads `dots_blanked`
- [ ] 1.4 Migration, four steps, **each guarded independently**: create the table
      (skip if present); backfill one row per background with `dots_blanked > 0`
      (skip only if blank *rows* already exist — **not** if the table exists);
      drop `ix_character_backgrounds_release_night`; drop the three columns (skip
      each if absent). Backfill before drop
- [ ] 1.5 **Do not put one table-exists guard over the whole upgrade.**
      `db.create_all()` runs before Alembic on every boot, so the table already
      exists on any database that has booted this code — a leading guard would
      skip the backfill and silently discard every outstanding blank, then drop
      the columns on a later run with nothing carried across
- [ ] 1.6 Drop the index **before** its column. SQLite fails with `error in index
      ix_character_backgrounds_release_night after drop column: no such column`
      otherwise; the index is declared in both `db.py` and `6d2a4f0be9c1`
- [ ] 1.7 Write a real `downgrade()`, in this order: re-add the three columns;
      repopulate from outstanding rows (sum, earliest releasing night); recreate
      the index **after** its column exists, not before; then **drop
      `character_background_blanks`**. Leaving the table behind makes a
      roll-forward skip its own backfill — rows already exist — so the new model
      would resume from stale pre-rollback data
- [ ] 1.8 Test on a database built at the previous revision holding a timed blank,
      a donated background, and a legacy row with `dots_blanked > 0` but no
      releasing night; confirm re-running `upgrade()` is a no-op and that
      `upgrade` → `downgrade` → `upgrade` round-trips without losing dots

## 2. Blanking writes a row

*Seam: `apps/web` Python — owner: primary session. Depends on 1.*

- [ ] 2.1 `blank_character_background` inserts a blank row instead of merging
      into the background's columns, and stops auto-releasing an older due blank
- [ ] 2.2 Remove the interim earlier-release-wins rule added for the #434 P1 —
      there is nothing left to reconcile
- [ ] 2.3 Grep for every **assignment** to the three now-derived attributes and
      rewrite it to act on blank rows instead. Known sites: the coterie
      blank-everything path (`bg.dots_blanked = bg.dots_total`), the undonate and
      remove-member resets (`dots_blanked = 0`), `set_character_background`'s
      clamp, and the orphaned-background purchase transfer. A property without a
      setter raises, so none of these can be missed silently
- [ ] 2.4 Nothing maintains a denormalized total — the properties are the only
      readers of the blank rows. Confirm no `dots_blanked` assignment remains
- [ ] 2.5 Tests: two blanks in different nights keep separate nights; blanking
      again never moves an outstanding night; over-blanking is refused counting
      every outstanding lot
- [ ] 2.6 **Ending a donation discards its lots.** `undonate_background` and
      `remove_member` currently set `dots_blanked = 0`; with rows they delete the
      background's outstanding lots instead, returning it to its owner at full
      rating. `approve_donation` needs nothing — it no longer touches blank state
      at all. Tests: a coterie blanks a donated background and the lot behaves
      normally; undonating with lots outstanding returns the background whole
- [ ] 2.7 **Rating reductions.** `set_character_background` can no longer clamp a
      derived total, so lowering a rating below what is outstanding reduces lots
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

*Seam: `apps/web` Jinja + blueprints — **delegable** after group 3. No schema,
no new DB writes.*

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
- [ ] 6.3 Update `AGENTS.md`'s two-representations list: backgrounds now have
      one authority for blank state (`character_background_blanks`), and
      `dots_blanked` is derived rather than stored — worth recording so nobody
      reintroduces a column for it
- [ ] 6.4 `docs/API_ENDPOINTS.md` — `GET /api/backgrounds/status` now carries
      per-lot release data; the doc describes only a single release night
- [ ] 6.5 Retarget the staff view in `background-blanking-timing-and-dashboard`
      group 3 to query blank rows rather than `dots_blanked > 0`, which stops
      working as a class-level filter. Whichever change lands second carries it
- [ ] 6.6 Out of scope but found here: `blank_donated_background` writes without a
      `log_action`, so that route has no audit trail. Raise separately rather than
      folding it in
