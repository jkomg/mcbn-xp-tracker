## Ownership

Each group is annotated with its seam and intended owner, per
`docs/CODEX_TASK_BRIEF.md`. Groups 1 and 2 are the behaviour fix and stay with
the session holding the context. Groups 3 and 4 are bounded, touch no schema and
write nothing to the database, so they are safe to delegate.

Groups 1→2 are ordered. Groups 3 and 4 are independent of each other and of 1–2,
so they can run in parallel in separate branches.

## 1. Calendar: has this night started?

*Seam: `apps/web` Python — owner: primary session*

- [x] 1.1 Add `night_has_started(night_number: int) -> bool | None` to
      `apps/web/app/game_calendar.py` — plus `night_start_date()`, which it reads
      and which the staff view in group 3 also needs
- [x] 1.2 Compare against the night's `start_date` from `_RAW`, using the same
      `date.today()` basis `get_calendar()` already uses. Takes an optional
      `today` so its tests do not expire as real time passes
- [x] 1.3 Unit tests — `tests/test_game_calendar_night_start.py`, 8 tests: start
      passed, starting today (started), starting tomorrow, the 2026-09-04 case
      from the issue, unknown night, and past the calendar's end

## 2. Release: gate on the night having begun

*Seam: `apps/web` Python — owner: primary session. Depends on group 1.*

- [x] 2.1 In `db_service.release_due_background_blanks`, filter the loaded
      candidate rows by `night_has_started(row.release_night_number)`, keeping
      the existing `release_night_number <= current_night_number` condition
      rather than replacing it
- [x] 2.2 Hold — do not release, do not drop — any row whose releasing night is
      unknown to the calendar
- [x] 2.3 Tests in `tests/test_background_blanking.py`. 4 of the 5 new cases were
      confirmed to fail against the ungated code; the fifth
      (`test_the_period_condition_still_applies`) passes either way by design —
      it guards against a later change *replacing* the period condition instead
      of keeping both, which design.md warns against
- [x] 2.4 Verified: `release_due_background_blanks` has one caller,
      `POST /api/backgrounds/release-due`
- [x] 2.5 **Not in the original plan.** `blank_character_background` is a second
      release path — it auto-releases an older due blank before stacking a new
      one, using the same flag-based comparison, so blanking again during an
      early-opened period returned the earlier dots early too. Gated identically.
      Found by the regression-hygiene rule about checking sibling code for the
      same shape
- [x] 2.7 **Codex P1 on #434, a regression this gate introduced.** Holding an
      older blank left the code below still overwriting `release_night_number`
      with *this* night's later release, so a Night 68 dot due on Night 69 was
      rescheduled to Night 73 when the player blanked again before Night 69
      started — taking the held dots away a whole extra cycle for blanking
      something else. Before this change that dot would have been released
      (early, but released), so nothing could be extended. Interim fix: the
      earlier release night wins when stacking. **The modelled fix is per-blank
      rows, decided and specified as its own change** — one
      `release_night_number` per background cannot express two schedules
- [x] 2.6 Three existing tests used invented nights (101/102/103) the calendar has
      never heard of, so the gate held them. Moved onto real calendar nights
      (68 → 69, both safely past, so they stay deterministic).
      `test_release_due_backgrounds_api_returns_released` had been *encoding the
      bug* — it opened the next night's period and asserted the dots released

## 3. Staff view: outstanding blanks across the roster

*Seam: `apps/web` Python + Jinja — **delegable**. Read-only: no DB writes, so no
audit-log or Sheets-mirror pairing obligation. No schema change.*

- [x] 3.1 Staff-only route listing every `DbCharacterBackground` with
      `dots_blanked > 0`: character, background, dots blanked, dots total, night
      blanked, releasing night — `GET /roster/blanks`, backed by
      `db_service.get_outstanding_background_blanks()`. Also shows the releasing
      night's calendar start date and marks coterie-donated backgrounds.
      **Retargeted by `per-blank-background-release` 6.5** once `dots_blanked`
      stops being a column
- [x] 3.2 Mark each row's state — not yet due, due now, or releasing night
      unknown to the calendar (the group-2 hold case, which must be visible). Due
      and unknown rows also raise a banner, since release polls every two minutes
      and a lingering due row means something is not running
- [x] 3.3 Empty state: say nothing is blanked rather than render an empty table
- [x] 3.4 Reachable from staff navigation, following the existing nav pattern — an
      indented "Blanked Backgrounds" item under Roster. Six existing tests stub the
      `roster` blueprint to render `base.html` and gained a `blanks` endpoint
- [x] 3.5 Route-level tests — `tests/test_roster_blanks_view.py`, 6 tests, rows
      created through `blank_character_background` with the calendar's today
      pinned to 2026-09-16. Collapsing the due/pending split made 2 of them fail

## 4. Bot: say when the dots are usable

*Seam: `apps/bot` TypeScript — **delegable**. Single file, self-contained,
`npm run check` is the gate.*

- [x] 4.1 In `apps/bot/src/services/backgroundBlankReleaseService.ts`, reword the
      notification so it states the dots are available now, and drop or rephrase
      the bare `Current night: <label>` line whose embedded date range reads as a
      future effective date. Dropped; the message is built by an exported
      `buildBlankReleaseMessage`
- [x] 4.2 Update the service's tests for the new wording. **There were none** —
      added `src/__tests__/backgroundBlankReleaseService.test.ts`, including a
      `tick()` case replaying the 2026-09-04 batch and asserting the period label
      does not reach the message
- [x] 4.3 `npm run check` passes from `apps/bot`

## 5. Close out

- [x] 5.1 `./venv/bin/pytest -q --cov=app --cov-report=term-missing --cov-fail-under=30`
      and `./venv/bin/ruff check app tests` pass from `apps/web`
- [x] 5.2 Note the behaviour change in `CHANGELOG.md`: blanked dots now return
      when the night opens rather than when its period opens — shipped with #434;
      the staff view and wording have their own entry
- [x] 5.3 Record in the PR that blanks released early before this change are left
      released, per design.md's Risks — recorded in #434
