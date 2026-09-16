"""one row per background blank, so each returns on its own night

`character_backgrounds` held a single blank per background -- `dots_blanked`,
`blanked_at_night_number`, `release_night_number` -- and a player can hold two
blanks with different release nights. This adds `character_background_blanks`,
one row per act of blanking, and carries each existing blank across.

Additive only. The three legacy columns and
`ix_character_backgrounds_release_night` stay: entrypoint.sh runs this before
gunicorn starts, while the previous revision is still serving and still maps
them, so dropping them here would break every background read until traffic
shifts. The model no longer maps them; a follow-up migration drops them once no
deployed revision does. Until then they go stale, and a blank taken on the
outgoing revision during cutover writes only to them and is lost -- accepted,
see openspec/changes/per-blank-background-release/design.md.

Every step is guarded on its own and tolerates losing a race, because
db.create_all() runs first on every boot (so the table usually exists already)
and two instances can boot at once.

Revision ID: 8a3e5c7d9b21
Revises: 3f81c22ad5e7
Create Date: 2026-09-16

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8a3e5c7d9b21'
down_revision = '3f81c22ad5e7'
branch_labels = None
depends_on = None


_BLANKS = 'character_background_blanks'
_BACKGROUNDS = 'character_backgrounds'
_LEGACY = ('dots_blanked', 'blanked_at_night_number', 'release_night_number')


def _columns(conn, table):
    return {c['name'] for c in sa.inspect(conn).get_columns(table)}


def _tables(conn):
    return set(sa.inspect(conn).get_table_names())


def upgrade():
    conn = op.get_bind()

    # 1. The table. IF NOT EXISTS rather than an inspector check alone: two
    # deployments can both see it missing, and the loser's plain CREATE TABLE
    # would fail and take startup down. Matches the model's definition.
    op.execute(sa.text(f"""
        CREATE TABLE IF NOT EXISTS {_BLANKS} (
            id INTEGER NOT NULL,
            character_background_id INTEGER NOT NULL,
            dots INTEGER NOT NULL,
            blanked_at_night_number INTEGER,
            release_night_number INTEGER NOT NULL,
            released_at VARCHAR(20),
            created_at VARCHAR(20) NOT NULL,
            created_by VARCHAR(100) NOT NULL,
            PRIMARY KEY (id),
            FOREIGN KEY(character_background_id) REFERENCES {_BACKGROUNDS} (id) ON DELETE CASCADE
        )
    """))
    op.execute(sa.text(
        f'CREATE INDEX IF NOT EXISTS ix_{_BLANKS}_character_background_id '
        f'ON {_BLANKS} (character_background_id)'
    ))
    op.execute(sa.text(
        f'CREATE INDEX IF NOT EXISTS ix_{_BLANKS}_outstanding_release '
        f'ON {_BLANKS} (release_night_number) WHERE released_at IS NULL'
    ))

    # 2. Backfill -- guarded on the legacy columns, not on the table. The table
    # almost always exists by now (create_all), so a table guard would skip
    # this and silently drop every outstanding blank. On a fresh database the
    # columns were never created, and referencing them would abort startup.
    if _BACKGROUNDS not in _tables(conn):
        return
    if not set(_LEGACY) <= _columns(conn, _BACKGROUNDS):
        return

    # One statement, keyed per background on *any* existing row, so it is a
    # no-op however many times or instances run it: a concurrent second run sees
    # the first run's rows. Released rows count too, or a lot the new code has
    # already returned would be backfilled again from the stale column.
    op.execute(sa.text(f"""
        INSERT INTO {_BLANKS}
            (character_background_id, dots, blanked_at_night_number,
             release_night_number, released_at, created_at, created_by)
        SELECT cb.id,
               MIN(cb.dots_blanked, cb.dots_total),
               cb.blanked_at_night_number,
               cb.release_night_number,
               NULL,
               COALESCE(cb.updated_at, ''),
               'migration:8a3e5c7d9b21'
          FROM {_BACKGROUNDS} cb
         WHERE cb.dots_blanked > 0
           AND cb.dots_total > 0
           AND cb.release_night_number IS NOT NULL
           AND NOT EXISTS (
               SELECT 1 FROM {_BLANKS} b WHERE b.character_background_id = cb.id
           )
    """))

    # A blank with no releasing night cannot be represented -- every blank now
    # returns. Only the donation bug fixed in #440 produced one, and both
    # databases held none when this was written. Clear it, which is what ending
    # that donation would have done, so nothing can resurrect it on downgrade.
    op.execute(sa.text(f"""
        UPDATE {_BACKGROUNDS}
           SET dots_blanked = 0, blanked_at_night_number = NULL
         WHERE dots_blanked > 0 AND release_night_number IS NULL
    """))


def downgrade():
    conn = op.get_bind()
    if _BACKGROUNDS not in _tables(conn):
        return

    # 1. The legacy columns, with their original definitions from 6d2a4f0be9c1.
    # An existing database still has them; a fresh one never did, because
    # create_all built the post-change table. dots_blanked needs its server
    # default: adding a NOT NULL column without one fails on a table with rows.
    definitions = {
        'dots_blanked': 'INTEGER NOT NULL DEFAULT 0',
        'blanked_at_night_number': 'INTEGER',
        'release_night_number': 'INTEGER',
    }
    for column in _LEGACY:
        if column in _columns(conn, _BACKGROUNDS):
            continue
        try:
            op.execute(sa.text(
                f'ALTER TABLE {_BACKGROUNDS} ADD COLUMN {column} {definitions[column]}'
            ))
        except sa.exc.OperationalError as exc:
            # Another instance added it between the check and the ALTER.
            if 'duplicate column' not in str(exc).lower():
                raise
    op.execute(sa.text(
        f'CREATE INDEX IF NOT EXISTS ix_character_backgrounds_release_night '
        f'ON {_BACKGROUNDS} (release_night_number)'
    ))

    # 2. Recompute every background, not only those with lots. The columns
    # were not maintained while this revision was live, so one whose lot has
    # since been released still claims those dots; it must come back as 0/NULL.
    # The two nights come from the same lot: the earliest to release.
    if _BLANKS in _tables(conn):
        earliest = (
            f'SELECT {{col}} FROM {_BLANKS} b '
            f'WHERE b.character_background_id = {_BACKGROUNDS}.id AND b.released_at IS NULL '
            f'ORDER BY b.release_night_number, b.id LIMIT 1'
        )
        op.execute(sa.text(f"""
            UPDATE {_BACKGROUNDS}
               SET dots_blanked = COALESCE((
                       SELECT SUM(b.dots) FROM {_BLANKS} b
                        WHERE b.character_background_id = {_BACKGROUNDS}.id
                          AND b.released_at IS NULL), 0),
                   release_night_number = ({earliest.format(col='b.release_night_number')}),
                   blanked_at_night_number = ({earliest.format(col='b.blanked_at_night_number')})
        """))

    # 3. Drop the table. Not tidiness: left behind, the old code edits the
    # columns while stale rows sit here, and a later upgrade skips its backfill
    # for every background that has rows -- resuming from pre-rollback data.
    op.execute(sa.text(f'DROP TABLE IF EXISTS {_BLANKS}'))
