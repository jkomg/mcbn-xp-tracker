## Precondition

- [x] 0.1 `per-blank-background-release` (migration `8a3e5c7d9b21`) is deployed
      to dev and prod, and no older revision is serving in either
      *Prod deployed `bd0b99e` (#446) and later; last prod deploy `c3c87a0`
      on 2026-10-04.*

## 1. Migration

*Seam: `apps/web` migrations — owner: primary session. `AGENTS.md` names
migrations as not-delegated.*

- [x] 1.1 New revision after `8a3e5c7d9b21`: `DROP INDEX IF EXISTS
      ix_character_backgrounds_release_night`
- [x] 1.2 Then drop `dots_blanked`, `blanked_at_night_number` and
      `release_night_number`, each only if present, treating "no such column"
      as a lost race rather than a failure
      *Shipped as an inspect-then-drop guard; a concurrent "no such column"
      is not caught, so two upgrades racing on one database could fail one.*
- [x] 1.3 `downgrade()` re-adds each absent column with its original definition
      (`dots_blanked INTEGER NOT NULL DEFAULT 0`) and the index
- [x] 1.4 Tests, modelled on `tests/test_per_blank_migration.py`: upgrade from a
      database at `8a3e5c7d9b21` holding blank rows leaves them untouched and
      removes the columns and index; rerunning is a no-op; a fresh database
      (no columns) upgrades cleanly; downgrading through both revisions puts
      every outstanding blank back in the legacy columns
      *Shipped: drop on a legacy DB, fresh-DB no-op, downgrade restores the
      columns with a default. Not shipped: an explicit rerun test, and a
      downgrade through `8a3e5c7d9b21` asserting blanks land back in the legacy
      columns (that fold is `8a3e5c7d9b21`'s own downgrade).*
- [x] 1.5 After upgrading, `alembic.autogenerate.compare_metadata` against the
      model reports no differences
      *Verified 2026-10-09 against a fresh database at head: zero diffs.*

## 2. Close out

- [x] 2.1 Remove the "columns still exist" and "autogenerate proposes dropping
      them" notes from `AGENTS.md` and `CLAUDE.md`
- [x] 2.2 `CHANGELOG.md`
- [x] 2.3 From `apps/web`: `./venv/bin/pytest -q --cov=app
      --cov-report=term-missing --cov-fail-under=30`, `./venv/bin/ruff check app
      tests`, `./venv/bin/python -m compileall app tests`
