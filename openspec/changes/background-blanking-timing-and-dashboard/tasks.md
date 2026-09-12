## Ownership

Each group is annotated with its seam and intended owner, per
`docs/CODEX_TASK_BRIEF.md`. Groups 1 and 2 are the behaviour fix and stay with
the session holding the context. Groups 3 and 4 are bounded, touch no schema and
write nothing to the database, so they are safe to delegate.

Groups 1→2 are ordered. Groups 3 and 4 are independent of each other and of 1–2,
so they can run in parallel in separate branches.

## 1. Calendar: has this night started?

*Seam: `apps/web` Python — owner: primary session*

- [ ] 1.1 Add `night_has_started(night_number: int) -> bool | None` to
      `apps/web/app/game_calendar.py`, returning `True`/`False` for a night
      present in `_RAW` and `None` when the night is unknown, so callers can
      distinguish "not yet" from "no idea"
- [ ] 1.2 Compare against the night's `start_date` from `_RAW`, using the same
      `date.today()` basis `get_calendar()` already uses
- [ ] 1.3 Unit tests in `apps/web/tests/`: a night whose start has passed, one
      starting today (started — the night opens on its start date), one starting
      in the future, and an unknown night number returning `None`

## 2. Release: gate on the night having begun

*Seam: `apps/web` Python — owner: primary session. Depends on group 1.*

- [ ] 2.1 In `db_service.release_due_background_blanks`, filter the loaded
      candidate rows by `night_has_started(row.release_night_number)`, keeping
      the existing `release_night_number <= current_night_number` condition
      rather than replacing it
- [ ] 2.2 Hold — do not release, do not drop — any row whose releasing night is
      unknown to the calendar
- [ ] 2.3 Tests: a blank whose releasing night's period is open but whose start
      date is in the future is NOT released; the same blank IS released once the
      date arrives; an unknown releasing night is held; a blank already due by
      both conditions still releases. **Confirm each fails against the unfixed
      code** — the first of these is the regression that reproduces the 2026-09-04
      early release
- [ ] 2.4 Verify no other caller of `release_due_background_blanks` changes
      behaviour (currently only `POST /api/backgrounds/release-due`)

## 3. Staff view: outstanding blanks across the roster

*Seam: `apps/web` Python + Jinja — **delegable**. Read-only: no DB writes, so no
audit-log or Sheets-mirror pairing obligation. No schema change.*

- [ ] 3.1 Staff-only route listing every `DbCharacterBackground` with
      `dots_blanked > 0`: character, background, dots blanked, dots total, night
      blanked, releasing night
- [ ] 3.2 Mark each row's state — not yet due, due now, or releasing night
      unknown to the calendar (the group-2 hold case, which must be visible)
- [ ] 3.3 Empty state: say nothing is blanked rather than render an empty table
- [ ] 3.4 Reachable from staff navigation, following the existing nav pattern
- [ ] 3.5 Route-level tests: rows render with the right state per case, a
      non-staff request is rejected, and the empty state renders

## 4. Bot: say when the dots are usable

*Seam: `apps/bot` TypeScript — **delegable**. Single file, self-contained,
`npm run check` is the gate.*

- [ ] 4.1 In `apps/bot/src/services/backgroundBlankReleaseService.ts`, reword the
      notification so it states the dots are available now, and drop or rephrase
      the bare `Current night: <label>` line whose embedded date range reads as a
      future effective date
- [ ] 4.2 Update the service's tests for the new wording
- [ ] 4.3 `npm run check` passes from `apps/bot`

## 5. Close out

- [ ] 5.1 `./venv/bin/pytest -q --cov=app --cov-report=term-missing --cov-fail-under=30`
      and `./venv/bin/ruff check app tests` pass from `apps/web`
- [ ] 5.2 Note the behaviour change in `CHANGELOG.md`: blanked dots now return
      when the night opens rather than when its period opens
- [ ] 5.3 Record in the PR that blanks released early before this change are left
      released, per design.md's Risks
