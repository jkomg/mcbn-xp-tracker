## Context

See proposal.md and `per-blank-background-release/design.md`, whose
"unmapped in this change and dropped in a follow-up" decision this completes.

## Decisions

**Drop the index before its column.** SQLite refuses to drop a column an index
still references: dropping `release_night_number` with
`ix_character_backgrounds_release_night` present fails with `error in index
ix_character_backgrounds_release_night after drop column: no such column`.
Verified 2026-09-12. The index is declared in migration `6d2a4f0be9c1` and
re-created by `8a3e5c7d9b21`'s downgrade.

**Native `DROP COLUMN`, not a table rebuild.** Turso and SQLite both support
`ALTER TABLE ... DROP COLUMN` on a table other tables reference by foreign key,
provided the dropped column is not itself part of a constraint. Verified
2026-09-12 against raw SQLite, Alembic's `op.drop_column`, and the dev Turso
database. None of the three columns is in a constraint.

**Guard each step on existence, and tolerate losing the race.** A fresh
database never had these columns (`create_all` builds the post-change table),
and two instances can boot at once. `DROP INDEX IF EXISTS` covers the index; for
each column, check it exists and treat "no such column" as someone else having
dropped it first.

**Downgrade re-adds the columns with their original definitions** —
`dots_blanked INTEGER NOT NULL DEFAULT 0`, the two nights nullable — and the
index. It does not repopulate them: that is `8a3e5c7d9b21`'s downgrade's job,
which runs next if the rollback continues, and which already recomputes every
background from the blank rows.

## Risks / Trade-offs

- [Shipped before the previous change is live everywhere] → The precondition in
  proposal.md. Check the deployed revisions in both environments before
  merging, not just that the previous PR merged.
- [A rollback past this change needs both downgrades] → Same as every schema
  change here: `entrypoint.sh` only upgrades.
