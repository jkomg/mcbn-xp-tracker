## Context

See proposal.md. Blanking already has working machinery across four layers:
`DbCharacterBackground` carries `dots_blanked`, `blanked_at_night_number` and
`release_night_number`; `db_service.blank_character_background` stamps the
release night via `game_calendar.next_night_after_downtime`;
`db_service.release_due_background_blanks` returns what is due;
`POST /api/backgrounds/release-due` drives it and the bot's
`BackgroundBlankReleaseService` polls that every two minutes and notifies the
player's cubby channel. None of that shape needs changing.

The defect is one comparison. `release_due_background_blanks(current_night_number)`
is passed `_current_open_night().night_number`, and `_current_open_night()` is
`[p for p in periods if p.submissions_open and p.active]` sorted by
`night_number` descending. No date is consulted anywhere in that path, so
"current night" means "newest night staff have opened", which runs ahead of the
calendar by however long staff open periods in advance.

`game_calendar.py` holds the authoritative dates as static `_RAW` tuples and
already computes today-relative status in `get_calendar()`. It is the right owner
for the question "has this night started".

## Goals / Non-Goals

**Goals:**
- Make release honour the rule `next_night_after_downtime` already documents.
- Keep the change surgical: one new calendar query, one filter, one call site.
- Give staff visibility, so a timing regression is observable without reading
  Discord history.

**Non-Goals:**
- Redefining `_current_open_night()`. Six other call sites rely on its current
  flag-based meaning (claims, blanking, period listings); changing it to satisfy
  the release path would alter submission behaviour as a side effect.
- Any schema change. `release_night_number` plus the calendar is sufficient.
- Reconciling blanks already released early. See Migration Plan.

## Decisions

**Put the date question in `game_calendar.py`, not in `db_service`.** That module
already owns the night→date mapping and the today-relative comparison in
`get_calendar()`. A `night_has_started(night_number)` query there keeps
`db_service` free of calendar parsing and keeps one module authoritative for
dates. `db_service.release_due_background_blanks` then filters its existing
candidate set by it.

**Filter in Python, not SQL.** The candidate set is already loaded
(`dots_blanked > 0 AND release_night_number <= current`) and is small — one row
per outstanding blank. The calendar is static Python data with no database
representation, so a SQL-side date comparison would mean duplicating the
calendar into the schema. Filter the loaded rows.

**Keep `release_night_number <= current_night_number` as well, rather than
replacing it.** The two conditions answer different questions and both should
hold: the period-based one is the existing in-game bookkeeping, and the new
date-based one is the wall-clock gate. Keeping both means the change can only
ever make release *later*, never earlier — a strictly safer direction for a
live game, and it means a night missing from the calendar cannot cause a blank
to release ahead of schedule.

**An unknown night does not release and does not vanish.** If
`night_has_started` cannot find the night (the calendar ends at Night 77 /
2027-01-10), the blank is held rather than released or dropped. Holding is
recoverable — staff see it in the new view and the calendar can be extended;
releasing on an unknown date is not. This makes extending `_RAW` an operational
requirement, which the staff view surfaces rather than hides.

**The staff view is read-only.** It reports state and does not offer a manual
release button. Adding one would create a second release path with its own
timing semantics, which is the class of problem this change exists to remove.
If staff need a manual override later it should be specified deliberately.

## Risks / Trade-offs

- [Blanks released early over the current period stay released — this change does
  not claw dots back] → Accepted, and deliberate: retroactively re-blanking dots
  a player may already have spent would be worse than the original error. The new
  staff view makes the current state inspectable so staff can correct individual
  cases by hand if they choose.
- [The game calendar is static and ends at Night 77 (2027-01-10). Past that,
  nothing releases] → This is the safe failure direction, it is visible in the
  staff view rather than silent, and the same static calendar already gates
  `next_night_after_downtime`, so the horizon is not newly introduced. Worth a
  follow-up to warn when the calendar is within N nights of its end.
- [Players accustomed to dots returning when the period opens will experience
  this as a delay of a few days] → It is the documented rule, and the
  notification now states availability plainly, which is the change the issue
  actually asked for.
- [A release can now be up to one poll interval (2 min) later than the night's
  start] → Already true of the existing poll-driven design; unchanged.

## Migration Plan

No schema change, no backfill, no feature flag. Additive calendar query plus one
filter; the staff view is a new read-only route. Deploy is ordinary.

One sequencing note: the web change is what fixes the timing, and it is safe to
deploy alone — the bot's existing notification keeps working unchanged, it simply
fires on the correct night. The bot wording change can follow independently.
Those two repos deploy separately in any case (CI publishes the bot image; Argo
CD in `home-automation` ships it).
