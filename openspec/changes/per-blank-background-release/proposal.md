## Why

A background row stores one blank: `dots_blanked`, `blanked_at_night_number`,
`release_night_number`. A player can blank dots more than once before the first
lot returns, and those two blanks have different release nights — which one
column cannot hold.

Today the second blank overwrites the first's schedule. On the #431 branch that
surfaced as a Codex P1: holding a Night 68 blank due on Night 69 and then
blanking again rescheduled the held dots to Night 73, taking them away an extra
downtime cycle because the player blanked something else. That shipped with an
interim rule — the earlier release wins, so a held blank is never pushed out —
which removes the harm but is still wrong in the other direction: the newly
blanked dots come back sooner than their own rule says, so blanking one dot
early in a night and three more just before the release returns all four at once.

Neither rule is right because the model cannot express the situation. Blanks
need their own release nights.

## What Changes

- Add `character_background_blanks`: one row per act of blanking, carrying its
  dot count, the night it was taken, and the night it returns. This becomes the
  authority for what is blanked and when it comes back.
- Release iterates those rows, returning each on its own night, and the
  calendar gate from the #431 work applies per row rather than per background.
- Blanking again never touches an outstanding blank's schedule. The interim
  earlier-release-wins rule is removed along with the need for it.
- `character_backgrounds.dots_blanked` is kept as a denormalized total,
  maintained in exactly one place, because the player sheet, the coterie sheet,
  the bot API response and the bot's own types all read it.

## Capabilities

### Modified Capabilities
- `background-blanking`: blanks are tracked per blank rather than per
  background, so each returns on its own night.

## Non-Goals

- **Changing how long a blank lasts.** Still the opening of the first night
  after the next downtime, per `next_night_after_downtime`.
- **Changing the calendar gate.** The #431 rule stands: a blank returns only
  once its releasing night has actually started. This change applies it per
  blank.
- **Changing what blanking costs or grants in-game.** Purely a fix to how the
  system represents what players already do.
- **Dropping the legacy columns.** See design.md — SQLite/Turso column drops are
  hazardous and every display site reads `dots_blanked`.

## Impact

- `apps/web/app/db.py` — new model; `character_backgrounds` keeps its columns.
- `apps/web/app/db_service.py` — `blank_character_background` creates a blank row
  instead of merging into one; `release_due_background_blanks` iterates rows;
  `get_character_backgrounds` reports outstanding blanks;
  `set_character_background` and `rename_character` gain the new table.
- `apps/web/app/blueprints/coteries.py` — `blank_donated_background`, the
  blank-everything path at the donation/undonation boundary, and the orphaned
  background purchase, which transfers a row carrying blank state.
- `apps/web/app/blueprints/player.py`, `api.py` — flash and response text can
  now name more than one pending release.
- `apps/web/app/templates/player/character.html`, `coteries/view.html` — a
  background can show several pending releases rather than one.
- `apps/bot/src/types.ts`, `services/adapter.ts` — the backgrounds-status and
  release payload shapes, if the API response changes shape.
- New migration with the column-exists/table-exists guards this repo requires,
  plus a backfill turning each existing blank into one row.
