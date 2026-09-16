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

- [x] 1.1 Add `DbCharacterBackgroundBlank` to `apps/web/app/db.py`: FK to
      `character_backgrounds`, `dots`, `blanked_at_night_number`,
      `release_night_number` (always set — every blank returns), `released_at`
      (null while outstanding), indexed on the FK and — crucially — with a
      **partial** index `(release_night_number) WHERE released_at IS NULL` rather
      than a plain one. Released rows are kept indefinitely and the release
      endpoint is polled every two minutes, so an index on the night alone decays:
      almost every historical row has a night at or before the current one, and
      the scan grows with history forever. The partial index only ever covers
      outstanding lots, which is the set the query wants. SQLite supports this —
      verified 2026-09-13
- [x] 1.2 Add an `outstanding_blanks` relationship on `DbCharacterBackground`,
      declared `lazy='selectin'` so the derived properties below do not issue a
      query per background
- [x] 1.3 Replace the mapped `dots_blanked`, `blanked_at_night_number` and
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
- [x] 1.4 Migration, two steps, both guarded, **no drops**: create the table (skip
      if present); backfill one row per background with `dots_blanked > 0`. The
      index and columns stay — 1.9 explains why
- [x] 1.4a The backfill needs **two** guards, for two different cases. Skip it
      entirely if the legacy columns are absent: on a fresh database
      `create_all()` builds `character_backgrounds` from the post-change model,
      so they never exist and referencing them aborts startup. And write it as one
      `INSERT ... SELECT ... WHERE NOT EXISTS` keyed per background, for the
      existing-database case where two instances boot together — multiple rows per
      background are legitimate so nothing catches a duplicate, and with
      `dots_blanked` derived the player sees double immediately. "Skip if the
      table is empty" satisfies neither
- [x] 1.5 **Do not put one table-exists guard over the whole upgrade.**
      `db.create_all()` runs before Alembic on every boot, so the table already
      exists on any database that has booted this code — a leading guard would
      skip the backfill and silently discard every outstanding blank, then drop
      the columns on a later run with nothing carried across
- [x] 1.6a **`db.create_all()` is the earlier race, and it is unguarded.**
      `app/__init__.py` calls it bare at line ~168, *before*
      `_upgrade_with_race_retry` — so the repo already hardened the Alembic step
      and left this one open. `create_all(checkfirst=True)` does a has-table check
      then creates, so two overlapping deployments can both pass it and one fails
      before Alembic ever runs. This change is the first to add a table since, so
      it is the one that exposes it. Fix it where it lives, and **retry rather than
      swallow**: `create_all()` walks the tables in order, so an "already exists"
      error aborts the traversal and every table after it goes uncreated. Catching
      and ignoring leaves the schema half-built, which is worse than failing. Wrap
      it the way `_upgrade_with_race_retry` wraps the upgrade — on conflict, call
      `create_all()` again, which skips what now exists and continues
- [x] 1.6 Make each DDL step tolerate losing a race, not merely check first. Two
      deployments can start together, both see the table absent, and the loser's
      `CREATE TABLE` then fails and takes startup down. Check *and* swallow the
      "already exists" failure. `fix/dedupe-key-migration-idempotency` exists
      because checking was not enough on its own
- [x] 1.9 **Do not drop the legacy columns or the index in this change.**
      `entrypoint.sh` runs `flask db upgrade` before `exec gunicorn`, so the
      migration completes while the *previous* Cloud Run revision is still serving
      and still mapping those columns — dropping them breaks every background read
      on the live revision until traffic shifts. Unmapping is safe where dropping
      is not: the columns stay, go stale, and the outgoing revision reads
      briefly-wrong values instead of erroring. Raise a follow-up change for the
      drop, to ship only once the unmapping is live everywhere. When writing it,
      remember the index must be dropped **before** its column — SQLite fails with
      `error in index ... after drop column: no such column`
- [x] 1.7 Write a real `downgrade()` — three guarded, retryable steps. First
      re-add any of the three columns that is absent: the follow-up change does the
      dropping, so an existing database still has them, but a **fresh** one never
      did —
      `create_all()` builds the post-change schema and the boot path stamps it at
      head, so a downgrade from head meets a table that has only ever had the new
      shape, and updating a column that was never created fails. Re-add each with
      **the original definition** — migration `6d2a4f0be9c1` declares
      `dots_blanked` as `nullable=False, server_default='0'`, and adding a NOT NULL
      column with no default to a table that already has rows fails on SQLite
      before the recompute can populate it. Then recompute the legacy columns for **every** background (sum of its outstanding lots, so
      **zero** where it has none; the two nights off its earliest-releasing lot, so
      **null** where it has none). Then drop
      `character_background_blanks` if present. The drop is not tidiness: leaving
      the table means old code edits the columns while stale rows remain, and a
      roll-forward skips its own backfill because rows exist, so the new model
      would resume from pre-rollback data Leaving the table behind makes a
      roll-forward skip its own backfill — rows already exist — so the new model
      would resume from stale pre-rollback data
- [x] 1.8 Test on a database built at the previous revision holding a timed blank
      and a donated background: confirm re-running `upgrade()` is a no-op, that
      running it twice concurrently produces one row per background, and that
      `upgrade` → `downgrade` → `upgrade` round-trips without losing dots
- [x] 1.8b Test the downgrade specifically against a background whose backfilled
      lot was **released** while the change was live. Its legacy column is stale
      and non-zero, it has no outstanding row, and the downgrade must zero it. A
      repopulate-only downgrade leaves it claiming blanked dots that already came
      back
- [x] 1.8a A legacy row with `dots_blanked > 0` and **no** releasing
      night is *deliberately* cleared, not preserved — every blank now has a
      night, so it is unrepresentable. Assert it is cleared; do not include it in
      the round-trip-without-loss case, which it would contradict. Both databases
      hold zero such rows (read-only count), so this is a guard, not a data path

## 2. Blanking writes a row

*Seam: `apps/web` Python — owner: primary session. Depends on 1.*

- [x] 2.1 `blank_character_background` inserts a blank row instead of merging
      into the background's columns, and stops auto-releasing an older due blank
- [x] 2.1a **The insert carries its own bound** — one
      `INSERT ... SELECT ... WHERE (sum of outstanding) + :dots <= dots_total` —
      rather than checking availability and then inserting. Two members can blank
      the same donated background at once and both pass a prior check before
      either writes, pushing the derived total above the rating. A rowcount of 0
      is the existing "only N available" refusal — **and a write conflict is not
      the same thing.** `blank_character_background` loads the background first, so
      each caller already holds a read snapshot; on libsql the insert can come back
      as a serialization conflict rather than as rowcount 0. Retry once on conflict
      and only then treat it as a refusal, or a legitimate blank gets reported to
      the player as "no dots available". `_upgrade_with_race_retry` is the existing
      shape for this. Test both paths by interleaving two reservations against a
      background with one dot left: one succeeds, one is refused, neither errors
- [x] 2.2 Remove the interim earlier-release-wins rule added for the #434 P1 —
      there is nothing left to reconcile
- [x] 2.3 Grep for every **assignment** to the three now-derived attributes and
      rewrite it to act on blank rows instead. Known sites: the coterie
      blank-everything path (`bg.dots_blanked = bg.dots_total`), the undonate and
      remove-member resets (`dots_blanked = 0`), `set_character_background`'s
      clamp, and the orphaned-background purchase transfer. A property without a
      setter raises, so none of these can be missed silently
- [x] 2.3a **Constructor keyword arguments count too, and a grep for assignments
      misses them.** `db_service.set_character_background` builds
      `DbCharacterBackground(... dots_blanked=0, blanked_at_night_number=None,
      release_night_number=None ...)` at line ~1431, and `cc_admin.draft_approve`
      does the same with `dots_blanked=0` at ~452. Once these are properties, the
      model will not accept them as kwargs at all — a new background simply has no
      outstanding lots, so all three are dropped from both call sites rather than
      set to their empty values
- [x] 2.4 Nothing maintains a denormalized total — the properties are the only
      readers of the blank rows. Confirm no `dots_blanked` assignment remains
- [x] 2.5 Tests: two blanks in different nights keep separate nights; blanking
      again never moves an outstanding night; over-blanking is refused counting
      every outstanding lot
- [x] 2.6 **Ending a donation discards its lots.** `undonate_background` and
      `remove_member` currently set `dots_blanked = 0`; with rows they delete the
      background's outstanding lots instead, returning it to its owner at full
      rating. `approve_donation` needs nothing — it no longer touches blank state
      at all. Tests: a coterie blanks a donated background and the lot behaves
      normally; undonating with lots outstanding returns the background whole
- [x] 2.7 **Rating reductions — in both places a rating can be lowered.**
      `cc_admin.draft_approve` assigns `existing.dots_total = dots` directly at
      ~line 448 while syncing `character_data['backgrounds']`, so approving a
      creator draft against an existing character can lower a rating without going
      anywhere near `set_character_background`. Both paths need the same
      reduce-lots rule; put it in one helper they both call rather than writing it
      twice. **Audit it in both**: a reduction mutates or deletes authoritative
      blank rows, and `cc_admin.draft_approve` commits with no `log_action` at all
      today — losing a player's blanked dots during a staff approval is exactly the
      kind of write that has to leave a trace. Fold this into 6.6's list rather
      than treating the creator path as a special case.
      `set_character_background` can no longer clamp a
      derived total, so lowering a rating below what is outstanding reduces lots
      newest-first, preserving the earliest promised return. Tests: reduce below
      outstanding; reduce while still above it (no change); reduce to zero with
      lots outstanding

## 3. Release iterates rows

*Seam: `apps/web` Python — owner: primary session. Depends on 2.*

- [x] 3.1 `release_due_background_blanks` iterates outstanding blank rows,
      applying `night_has_started` per row, holding a row whose night the
      calendar does not list
- [x] 3.2 Mark released rows with `released_at` rather than deleting them, then
      recompute the total
- [x] 3.3 Keep the existing return shape — one entry per background with an
      aggregated dot count — so the bot's notification and zod schema are
      unchanged
- [x] 3.4 Tests: only the due lot releases; two lots due the same night release
      together and report as one entry; an unknown night is held; the #431
      calendar-gate cases still hold

## 4. Character rename and deletion

*Seam: `apps/web` Python — owner: primary session*

- [x] 4.1 The new table keys off the background's id, not a character name, so
      `rename_character` needs no new entry — **verify that and say so**, since
      `AGENTS.md` calls out that list explicitly
- [x] 4.2 Confirm deleting a background or a character leaves no orphaned blank
      rows; add cascade or explicit cleanup if it does

## 5. Showing more than one pending release

*Seam: `apps/web` Jinja + blueprints — **delegable** after group 3. No schema,
no new DB writes.*

- [x] 5.0 **First**, extend `get_character_backgrounds` to carry the per-lot data.
      The player route hands the template plain dicts from that method, whose
      response is an aggregate plus one `release_night_number` — the template
      cannot enumerate lots it is never given. This also changes the
      `GET /api/backgrounds/status` payload, so it is the same task as 6.4's doc
      update and must land before 5.1 or 5.2 can work
- [x] 5.1 `player/character.html` shows each outstanding lot's dots and
      releasing night rather than a single night
- [x] 5.2 `coteries/view.html` does the same for donated backgrounds
- [x] 5.3 `player.py` / `api.py` flash and response text name the lot just
      blanked and its night, without implying it is the only one
- [x] 5.4 Route-level tests for one lot, two lots, and none

## 6. Close out

- [x] 6.1 From `apps/web`: `./venv/bin/pytest -q --cov=app
      --cov-report=term-missing --cov-fail-under=30`,
      `./venv/bin/ruff check app tests`, `./venv/bin/python -m compileall app tests`
- [x] 6.2 `CHANGELOG.md` — per-blank release tracking, and that the #434 interim
      rule is gone
- [x] 6.3 Update `AGENTS.md`'s two-representations list: backgrounds now have
      one authority for blank state (`character_background_blanks`), and
      `dots_blanked` is derived rather than stored — worth recording so nobody
      reintroduces a column for it
- [x] 6.4 `docs/API_ENDPOINTS.md` — `GET /api/backgrounds/status` now carries
      per-lot release data; the doc describes only a single release night
- [x] 6.4a `docs/WEB_APP.md` (Backgrounds tab, ~line 182) tells players each row
      shows "the scheduled release night if blanked" — singular. After 5.1 it
      shows every outstanding lot
- [x] 6.4b **The bot is deliberately left on the aggregate**, recorded rather than
      left unsaid. `adapter.ts` parses each background with a plain `z.object`,
      which **strips unknown keys**, and `CharacterBackgroundStatus` in `types.ts`
      mirrors it — so adding the per-lot field to the response never reaches the
      bot. Nothing breaks either: every field the bot reads survives as a derived
      property, and `release_night_number` stays a truthful "next release".
      Updating the bot is a change in a separate repo with its own Argo CD ship
      path, so it is a deliberate follow-up, not part of this. Say so in the PR,
      and record the Zod-stripping behaviour so whoever does it knows the schema
      **and** the type both need widening
- [x] 6.7 Raise the follow-up change that drops the index and the three columns,
      per 1.9. It must not ship until this one is live everywhere
- [x] 6.8 Put the accepted cutover window in the release notes: a blank served by
      the outgoing revision during the deploy writes only the legacy columns and
      will not exist afterwards. Deploy when nobody is mid-night. Stated so a lost
      blank is recognised rather than investigated as a new bug
- [x] 6.5 Retarget the staff view in `background-blanking-timing-and-dashboard`
      group 3 to query blank rows rather than `dots_blanked > 0`, which stops
      working as a class-level filter. Whichever change lands second carries it
- [x] 6.6 Add the missing `log_action` to every route that writes authoritative
      blank state, not just the one that creates it: `blank_donated_background`
      (creates a lot), `undonate_background` and `remove_member` (both **discard**
      outstanding lots, per 2.6), and `cc_admin.draft_approve` (**reduces** lots
      when a staff approval lowers a rating, per 2.7 — and it commits with no
      `log_action` whatsoever today). None of the four logs today.
      Discarding a player's blanked dots is at least as worth recording as taking
      them, and since this change makes the rows authoritative, shipping an
      unaudited delete of them would violate the convention `AGENTS.md` states
- [x] 6.6a **Sheets mirror: deliberately not added**, recorded because the same
      convention says to *check* for a counterpart rather than always add one.
      `player.blank_background` — the existing, closest analogue — calls
      `log_action` with no `sync_log_action`, so blanking is log-only today.
      Matching that keeps the two blanking routes symmetric; adding a mirror to the
      new ones alone would create exactly the asymmetry the convention exists to
      prevent. If blanking should be mirrored, that is a separate decision covering
      the existing route too

## Implementation notes

Recorded where the build departed from, or found more than, the plan above.

- **1.1** The partial index is `ix_character_background_blanks_outstanding_release`.
  The table also carries `created_at` / `created_by`, matching the audit columns
  on `character_backgrounds`. `blanked_at_night_number` is nullable, only so a
  legacy row with no blank night backfills faithfully; every new blank sets it.
  `released_at` is a `String(20)` in the same format as `updated_at`.
- **1.2** A second relationship, `blanks` (every lot, `cascade='all,
  delete-orphan'`), is what deletes lots with their background. It must not set
  `passive_deletes`: SQLite does not enforce the foreign key's `ON DELETE
  CASCADE` without `PRAGMA foreign_keys`, and a test caught the lots surviving.
- **1.4a** The backfill's `NOT EXISTS` matches **any** row for the background,
  released ones included. Matching only outstanding rows would backfill a lot the
  new code had already returned, from its stale column. It also clamps to the
  rating and skips `dots_total = 0`.
- **1.6** `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, so losing
  the race is not an error at all. Writing the concurrency test exposed a
  **pre-existing bug in `_upgrade_with_race_retry`**: `flask_migrate.upgrade`
  reports Alembic's `CommandError` by calling `sys.exit(1)`, and `SystemExit` is
  not an `Exception`, so the retry never ran. The losing instance exited and
  relied on Cloud Run restarting it. It now catches `SystemExit` too.
- **1.7** The downgrade also re-creates `ix_character_backgrounds_release_night`
  if absent, since the old model declares it.
- **1.8** The concurrent-upgrade test uses two subprocesses. Threads are not a
  valid stand-in, because Alembic's `op` and `context` are process-global. On
  SQLite the loser's migration is one transaction, so that test proves the loser
  survives, not the `NOT EXISTS`. Turso's HTTP adapter autocommits each
  statement; the rerun tests are what cover a second backfill. Separately,
  `compare_metadata` against a migrated database reports only the expected
  removals (the three columns and their index), for both a table built by
  `create_all` and one built by the migration.
- **2.1a** A conflict that persists after the retry is reported as "could not
  record the blank just now; please try again", not as a refusal. Reporting it
  as "only N available" would be false whenever dots are in fact available. The
  pre-insert availability check is gone entirely, so the bounded insert is the
  only thing that refuses, and the tests that run two reservations one after
  another use the same code path as a real race.
- **2.3** `coterie_donations.purchase_price`'s docstring said the orphaned
  purchase keeps `dots_blanked`; there was no assignment. Lots follow the row by
  foreign key, so the transfer needed no change.
- **2.7** Writing the creator-approval test exposed a **pre-existing bug**:
  `cc_admin.draft_approve` called `db_service._background_key(...)` on the
  `DBService` instance, where it does not exist, so since 2026-06-18 (`6207c6a`)
  every draft carrying backgrounds raised after the roster entry had already
  been committed, and its backgrounds were never created. Fixed. No test had ever
  approved a draft with backgrounds.
- **2.1a, revised (Codex P1 on #443).** Turso's HTTP adapter commits each
  statement by itself, so an insert can land while its response is lost, and the
  first version's retry then added a second lot, or reported a refusal for a
  blank that had in fact been recorded. Each blank now carries a `request_key`
  (unique index, migration `c4e1a9f27b58`; a separate revision because dev had
  already run `8a3e5c7d9b21`). The insert skips itself if its key exists, a
  refused insert checks whether its key landed, and after an error the key is
  checked before retrying. If even that check fails, the player is told the blank
  could not be confirmed, not that nothing was blanked.
- **1.6, revised.** With two migrations in one deploy, the losing instance could
  lose the `alembic_version` race again on the second revision, and an immediate
  single retry did: the two-process test failed about two runs in three.
  `_upgrade_with_race_retry` now makes up to four attempts with a 0.5s × attempt
  backoff. In testing the backoff is what fixed it; the extra attempts are
  margin, covered by a unit test that loses twice.
- **6.6, revised (Codex P1 on #443).** The first version logged undonate and
  member removal only when blanks were cancelled, leaving an ordinary withdrawal
  or removal unaudited. Both now log on every call, as
  `coterie_background_undonated` and `coterie_member_removed`, with cancelled
  blanks in the details. The four new action types are in `rename_character`'s
  list, so the entries follow a rename. The coterie blueprint's other writes
  (`add_member`, `approve_donation`, `deny_donation`, `activate`, and so on)
  still have no audit entry; that was already true and is not widened here.
- **3.1** Release claims each lot with a conditional `UPDATE ... WHERE released_at
  IS NULL`, so two overlapping polls cannot both report it.
- **4.2** Deleting a background deletes its lots, released history included.
  Deleting a *character* does not delete its `character_backgrounds` rows at all,
  which was already true before this change. The lots stay attached to rows that
  still exist, so they are not orphaned by foreign key, but a deleted character's
  outstanding lots still appear in the staff view and still release. Out of
  scope here; worth its own issue.
- **5.1–5.2** The coterie sheet lists each lot as visible text rather than in a
  `title` tooltip, which phones never show.
- **6.3** Replaced #441's "blank state is mid-migration, not implemented" bullet
  in `AGENTS.md`'s two-representations list with the per-blank fact. The same
  file's notes that `draft_approve` and `blank_donated_background` have no audit
  entry, and that `set_character_background` passes `dots_blanked=0`, are now
  written in the past tense.
- **6.8** The cutover window is recorded in `CHANGELOG.md`.

