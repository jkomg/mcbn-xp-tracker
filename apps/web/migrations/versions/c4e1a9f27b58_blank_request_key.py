"""key each background blank to the request that made it

Turso commits every statement by itself, so a blank's INSERT can land while its
HTTP response is lost. The caller then retries, and without a key the retry adds
a second lot for one blanking action. `request_key` lets the insert skip itself
when its request already landed, and lets the caller check. Codex P1 on #443.

A separate revision rather than an edit to 8a3e5c7d9b21 because dev had already
run that one.

`create_all` builds the column and index on any database where it creates the
table itself, so both steps are guarded, and the index uses IF NOT EXISTS so two
instances booting together cannot trip over each other.

Revision ID: c4e1a9f27b58
Revises: 8a3e5c7d9b21
Create Date: 2026-09-16

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4e1a9f27b58'
down_revision = '8a3e5c7d9b21'
branch_labels = None
depends_on = None


_TABLE = 'character_background_blanks'
_INDEX = 'uq_character_background_blanks_request_key'


def _columns(conn):
    return {c['name'] for c in sa.inspect(conn).get_columns(_TABLE)}


def upgrade():
    conn = op.get_bind()
    if _TABLE not in sa.inspect(conn).get_table_names():
        return
    if 'request_key' not in _columns(conn):
        try:
            op.execute(sa.text(f'ALTER TABLE {_TABLE} ADD COLUMN request_key VARCHAR(36)'))
        except sa.exc.OperationalError as exc:
            # Another instance added it between the check and the ALTER.
            if 'duplicate column' not in str(exc).lower():
                raise
    op.execute(sa.text(f'CREATE UNIQUE INDEX IF NOT EXISTS {_INDEX} ON {_TABLE} (request_key)'))


def downgrade():
    conn = op.get_bind()
    if _TABLE not in sa.inspect(conn).get_table_names():
        return
    # The index goes first: SQLite will not drop a column an index still uses.
    op.execute(sa.text(f'DROP INDEX IF EXISTS {_INDEX}'))
    if 'request_key' in _columns(conn):
        try:
            op.execute(sa.text(f'ALTER TABLE {_TABLE} DROP COLUMN request_key'))
        except sa.exc.OperationalError as exc:
            if 'no such column' not in str(exc).lower():
                raise
