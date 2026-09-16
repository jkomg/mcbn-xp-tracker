## Why

`per-blank-background-release` moved blank state into
`character_background_blanks` and stopped mapping three columns on
`character_backgrounds`: `dots_blanked`, `blanked_at_night_number` and
`release_night_number`, plus the index `ix_character_backgrounds_release_night`.
It deliberately left them in the database. `entrypoint.sh` migrates before the new
revision serves, while the previous revision still maps those columns, so
dropping them in the same release would have broken every background read on
the live revision until traffic shifted.

Once no deployed revision maps them, they are dead weight with two real costs:
they hold stale values that look authoritative to anyone querying the database
by hand, and `flask db migrate` proposes dropping them in every unrelated
migration until they are gone.

## What Changes

- A migration that drops `ix_character_backgrounds_release_night`, then the
  three columns, each step guarded and tolerant of losing a race.
- Nothing else. No model change: the model stopped mapping them in the previous
  change.

## Capabilities

### Modified Capabilities
- `background-blanking`: blank state is stored only per blank.

## Non-Goals

- Any behaviour change. Players and staff see nothing.
- Touching `character_background_blanks`.

## Impact

- New migration in `apps/web/migrations/versions/`, revising `8a3e5c7d9b21`.
- `AGENTS.md` and `CLAUDE.md`: remove the notes saying the columns still exist
  and that autogenerate proposes dropping them.
- `8a3e5c7d9b21`'s downgrade re-adds the columns if they are absent, so it keeps
  working once this has run. This change's own downgrade has to re-add them with
  their original definitions too.

## Precondition

**Do not ship this until `per-blank-background-release` is live in both dev and
prod** and no Cloud Run revision older than it is serving or can be rolled back
to without a deliberate downgrade. Shipping it early is the outage the previous
change was split to avoid.
