## Prerequisite

Depends on **#440** (merged 2026-09-12), which removed
`approve_donation`'s `bg.dots_blanked = bg.dots_total`. Until that landed, a
donated background was fully blanked with no releasing night — a state this
change cannot represent, and the reason an earlier draft modelled an indefinite
hold. Group 2 assumes donation no longer touches blank state, which is only true
on top of that fix.

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
- [ ] 1.3 Replace the mapped `dots_blanked`, `blanked_at_night_number` and
      `release_night_number` **columns** with properties derived from the
      outstanding blanks. Remove the `db.Column` declarations and the
      `ix_character_backgrounds_release_night` index from the model, but **do not
      drop anything in the database** — see 1.9. The properties are: `dots_blanked`
      = sum of outstanding lots; `release_night_number` = the earliest outstanding
      releasing night; `blanked_at_night_number` = the night **that same lot** was
      taken. The two nights are not the same value — `blanked_at` is when the blank
      happened, and it is exposed through the status API — so they must be read off
      one lot rather than both reporting the release. No setters, so an assignment raises rather than silently doing nothing,
      which is how 2.3 finds every existing one. `dots_available` keeps working
      unchanged since it reads `dots_blanked`
- [ ] 1.4 Migration, two steps, both guarded, **no drops**: create the table (skip
      if present); backfill one row per background with `dots_blanked > 0`. The
      index and columns stay — 1.9 explains why
- [ ] 1.4a The backfill needs **two** guards, for two different cases. Skip it
      entirely if the legacy columns are absent: on a fresh database
      `create_all()` builds `character_backgrounds` from the post-change model,
      so they never exist and referencing them aborts startup. And write it as one
      `INSERT ... SELECT ... WHERE NOT EXISTS` keyed per background, for the
      existing-database case where two instances boot together — multiple rows per
      background are legitimate so nothing catches a duplicate, and with
      `dots_blanked` derived the player sees double immediately. "Skip if the
      table is empty" satisfies neither
- [ ] 1.5 **Do not put one table-exists guard over the whole upgrade.**
      `db.create_all()` runs before Alembic on every boot, so the table already
      exists on any database that has booted this code — a leading guard would
      skip the backfill and silently discard every outstanding blank, then drop
      the columns on a later run with nothing carried across
- [ ] 1.6a **`db.create_all()` is the earlier race, and it is unguarded.**
      `app/__init__.py` calls it bare at line ~168, *before*
      `_upgrade_with_race_retry` — so the repo already hardened the Alembic step
      and left this one open. `create_all(checkfirst=True)` does a has-table check
      then creates, so two overlapping deployments can both pass it and one fails
      before Alembic ever runs. This change is the first to add a table since, so
      it is the one that exposes it. Fix it where it lives — wrap that call to
      tolerate "already exists" — rather than working around it in the migration
- [ ] 1.6 Make each DDL step tolerate losing a race, not merely check first. Two
      deployments can start together, both see the table absent, and the loser's
      `CREATE TABLE` then fails and takes startup down. Check *and* swallow the
      "already exists" failure. `fix/dedupe-key-migration-idempotency` exists
      because checking was not enough on its own
- [ ] 1.9 **Do not drop the legacy columns or the index in this change.**
      `entrypoint.sh` runs `flask db upgrade` before `exec gunicorn`, so the
      migration completes while the *previous* Cloud Run revision is still serving
      and still mapping those columns — dropping them breaks every background read
      on the live revision until traffic shifts. Unmapping is safe where dropping
      is not: the columns stay, go stale, and the outgoing revision reads
      briefly-wrong values instead of erroring. Raise a follow-up change for the
      drop, to ship only once the unmapping is live everywhere. When writing it,
      remember the index must be dropped **before** its column — SQLite fails with
      `error in index ... after drop column: no such column`
- [ ] 1.7 Write a real `downgrade()` — two guarded, retryable steps now that
      nothing is dropped on the way up: recompute the legacy columns for **every**
      background (sum of its outstanding lots, so **zero** where it has none; the
      two nights off its earliest-releasing lot, so **null** where it has none),
      then drop
      `character_background_blanks` if present. The drop is not tidiness: leaving
      the table means old code edits the columns while stale rows remain, and a
      roll-forward skips its own backfill because rows exist, so the new model
      would resume from pre-rollback data Leaving the table behind makes a
      roll-forward skip its own backfill — rows already exist — so the new model
      would resume from stale pre-rollback data
- [ ] 1.8 Test on a database built at the previous revision holding a timed blank
      and a donated background: confirm re-running `upgrade()` is a no-op, that
      running it twice concurrently produces one row per background, and that
      `upgrade` → `downgrade` → `upgrade` round-trips without losing dots
- [ ] 1.8b Test the downgrade specifically against a background whose backfilled
      lot was **released** while the change was live. Its legacy column is stale
      and non-zero, it has no outstanding row, and the downgrade must zero it. A
      repopulate-only downgrade leaves it claiming blanked dots that already came
      back
- [ ] 1.8a A legacy row with `dots_blanked > 0` and **no** releasing
      night is *deliberately* cleared, not preserved — every blank now has a
      night, so it is unrepresentable. Assert it is cleared; do not include it in
      the round-trip-without-loss case, which it would contradict. Both databases
      hold zero such rows (read-only count), so this is a guard, not a data path

## 2. Blanking writes a row

*Seam: `apps/web` Python — owner: primary session. Depends on 1.*

- [ ] 2.1 `blank_character_background` inserts a blank row instead of merging
      into the background's columns, and stops auto-releasing an older due blank
- [ ] 2.1a **The insert carries its own bound** — one
      `INSERT ... SELECT ... WHERE (sum of outstanding) + :dots <= dots_total` —
      rather than checking availability and then inserting. Two members can blank
      the same donated background at once and both pass a prior check before
      either writes, pushing the derived total above the rating. A rowcount of 0
      is the existing "only N available" refusal. Test it by interleaving two
      reservations against a background with one dot left
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
- [ ] 6.3 Update `AGENTS.md`'s two-representations list: backgrounds now have
      one authority for blank state (`character_background_blanks`), and
      `dots_blanked` is derived rather than stored — worth recording so nobody
      reintroduces a column for it
- [ ] 6.4 `docs/API_ENDPOINTS.md` — `GET /api/backgrounds/status` now carries
      per-lot release data; the doc describes only a single release night
- [ ] 6.4a `docs/WEB_APP.md` (Backgrounds tab, ~line 182) tells players each row
      shows "the scheduled release night if blanked" — singular. After 5.1 it
      shows every outstanding lot
- [ ] 6.7 Raise the follow-up change that drops the index and the three columns,
      per 1.9. It must not ship until this one is live everywhere
- [ ] 6.8 Put the accepted cutover window in the release notes: a blank served by
      the outgoing revision during the deploy writes only the legacy columns and
      will not exist afterwards. Deploy when nobody is mid-night. Stated so a lost
      blank is recognised rather than investigated as a new bug
- [ ] 6.5 Retarget the staff view in `background-blanking-timing-and-dashboard`
      group 3 to query blank rows rather than `dots_blanked > 0`, which stops
      working as a class-level filter. Whichever change lands second carries it
- [ ] 6.6 Add the missing `log_action` to every route that writes authoritative
      blank state, not just the one that creates it: `blank_donated_background`
      (creates a lot), and `undonate_background` and `remove_member` (both
      **discard** outstanding lots, per 2.6). None of the three logs today.
      Discarding a player's blanked dots is at least as worth recording as taking
      them, and since this change makes the rows authoritative, shipping an
      unaudited delete of them would violate the convention `AGENTS.md` states
