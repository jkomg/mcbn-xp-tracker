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
- Every blank has a releasing night. There is no indefinite-hold case: an
  earlier draft added one for donated backgrounds, on the reading that
  `approve_donation`'s `dots_blanked = dots_total` withheld the dots for the life
  of the donation. That assignment turned out to be a bug — it drove
  `dots_available` to 0 and made the coterie's own blanking impossible — and was
  removed separately. Donation sets `donated_coterie_id` and leaves the dots
  spendable, so a donated background's blanks are ordinary timed ones.
- Release iterates those rows, returning each on its own night, and the
  calendar gate from the #431 work applies per row rather than per background.
- Blanking again never touches an outstanding blank's schedule. The interim
  earlier-release-wins rule is removed along with the need for it.
- `dots_blanked`, `blanked_at_night_number` and `release_night_number` become
  properties derived from the blank rows, so nothing can disagree with the table
  that owns the facts. They are read by the player sheet, the coterie sheet and
  the bot API response, all of which keep working unchanged — `dots_available` is
  already a property, so the pattern is established.
- **This ships in three releases, because one Cloud Run revision is always still
  serving while the next one migrates.** `entrypoint.sh` runs `flask db upgrade`
  before gunicorn starts, so the schema changes under the previous revision:
  1. **Dual-write.** Create the table, backfill, and write *both* the rows and the
     legacy columns on every mutation — but keep reading the columns. Safe under
     either revision: the old one reads and writes columns as it always did, and
     the new one keeps them correct.
  2. **Switch reads.** Derive `dots_blanked` and the two night values from the
     rows, and unmap the columns. Safe because release 1 has been keeping the rows
     correct, so there is nothing to backfill and no window in which a write goes
     to only one representation.
  3. **Contract.** Drop the index and the three columns, once no deployed revision
     maps them.

  A single release cannot do this. Dropping the columns in one breaks the old
  revision's reads; unmapping them in one makes the old revision's *writes*
  invisible, because the backfill has already run and the new code never looks at
  the columns again. A player's blank would be silently discarded.

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
- **Dropping the legacy columns**, and **switching reads to the rows** — releases
  2 and 3, each its own change. This change is release 1 only.
  An earlier draft listed the drop as a non-goal on the grounds that SQLite and
  Turso could not drop a referenced table's column. That was wrong and was tested
  to destruction; they can. The reason to stage it is the deploy window, which has
  nothing to do with whether the DDL works.

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
- New migration: additive only — create the table and backfill one row per
  existing blank, with guards per step that tolerate losing a race rather than
  merely checking first, plus a working `downgrade()`. No drops; a follow-up
  change removes the index and the three columns once the unmapping is live
  everywhere.
- `docs/API_ENDPOINTS.md` — `GET /api/backgrounds/status` grows per-lot release
  data, and the doc currently describes only a single release night.
