## Why

Issue #431. Two of the three things that issue asks for turn out to be one bug
and one genuine gap; the third is blocked on other work.

**Release fires early.** `game_calendar.next_night_after_downtime` documents the
rule: *"a background blanked on any night stays blanked until the opening of the
first night after the subsequent downtime."* Blanking stamps
`release_night_number` correctly by that rule. But `release_due_background_blanks`
decides what is due by comparing against `_current_open_night()`, which resolves
the current night purely from `submissions_open`/`active` flags and never looks
at `start_date`. So the moment staff open the next night's period — routinely
days ahead — every blank scheduled for that night releases.

Observed 2026-09-04: a player was told *"your background refresh is ready.
Released 3 dot(s) of Mawla. Current night: **Night 69 - 9/8 - 9/20**"*. The dots
came back on 9/4; Night 69 opens 9/8. Four days early, and the message named a
future date range while reporting a completed release, which is how it was
noticed at all.

**Nobody can see blanking state.** Blanked dots appear only on the player's own
sheet and a coterie sheet. Staff have no roster-wide view, so an early release
is invisible unless a player happens to query a Discord message.

## What Changes

- Gate release on the night having actually **started**, per the static game
  calendar, rather than on a period being open for submissions. Taking a blank
  stays flag-based — staff opening a period is deliberate, and a player acting
  in an open period is legitimate. Only the release side becomes date-aware.
- Make the release notification state plainly that the dots are available now,
  and stop presenting a period label whose embedded dates read as a future
  effective date.
- Add a staff-facing view of blanking across the roster: who has dots blanked,
  on which background, when they were blanked, and which night returns them.

## Capabilities

### New Capabilities
- `background-blanking`: release timing tied to the game calendar, and
  staff-facing visibility of outstanding blanks.

### Modified Capabilities
(none — background blanking has no existing spec file; the current behaviour is
implementation, not a previously specified capability)

## Non-Goals

- **Background flaws linked to their parent background.** Issue #264 specifies
  this properly and it is a prerequisite, not part of this change. Flaws are a
  flat `flaws` list in sheet JSON today with no link to a background.
- **Flaws triggered by Messy Criticals and Bestial Failures.** Nothing in the
  system can observe a dice outcome; this is blocked on issue #430 (dice) and
  should follow #264.
- **Changing how long a blank lasts.** The until-after-next-downtime rule stands;
  this change makes the code honour the rule it already documents.
- **Changing which night a blank is *taken* in.** `_current_open_night()` keeps
  its present meaning for submission, claims, and blanking. Six other call sites
  depend on it.

## Impact

- `apps/web/app/game_calendar.py` — gains a query for whether a night has
  started, since this module already owns the authoritative dates.
- `apps/web/app/db_service.py` — `release_due_background_blanks` filters on that
  in addition to `release_night_number`.
- `apps/web/app/blueprints/api.py` — the release endpoint's response says what
  was actually released and when those dots became usable.
- `apps/bot/src/services/backgroundBlankReleaseService.ts` — notification wording.
- `apps/web/app/blueprints/` + templates — new staff blanking view.
- No schema change. No migration. `release_night_number` already holds
  everything the date gate needs.
