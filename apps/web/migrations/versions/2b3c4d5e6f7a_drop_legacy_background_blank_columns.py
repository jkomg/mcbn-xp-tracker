"""drop legacy background blank columns (dots_blanked, blanked_at_night_number, release_night_number)

These three columns on `character_backgrounds` were the old single-blank-per-background
scheme. Migration 8a3e5c7d9b21 introduced `character_background_blanks` (one row per
act of blanking) and intentionally left the legacy columns in place so the outgoing
revision could still map them during the rolling cutover. The model stopped mapping
them in 8a3e5c7d9b21; this migration removes them from the schema now that no deployed
revision references them.

On a fresh install `db.create_all()` builds the table from the current model, so these
columns are never created — the upgrade guards each drop accordingly.

Revision ID: 2b3c4d5e6f7a
Revises: c4e1a9f27b58
Create Date: 2026-10-01
"""
from alembic import op
import sqlalchemy as sa


revision = '2b3c4d5e6f7a'
down_revision = 'c4e1a9f27b58'
branch_labels = None
depends_on = None

_TABLE = 'character_backgrounds'
_LEGACY_COLUMNS = ('dots_blanked', 'blanked_at_night_number', 'release_night_number')
_LEGACY_INDEX = 'ix_character_backgrounds_release_night'


def _columns(conn):
    return {c['name'] for c in sa.inspect(conn).get_columns(_TABLE)}


def _indexes(conn):
    return {i['name'] for i in sa.inspect(conn).get_indexes(_TABLE)}


def upgrade():
    conn = op.get_bind()
    existing_cols = _columns(conn)
    existing_idxs = _indexes(conn)

    if _LEGACY_INDEX in existing_idxs:
        op.drop_index(_LEGACY_INDEX, table_name=_TABLE)

    for col in _LEGACY_COLUMNS:
        if col in existing_cols:
            op.drop_column(_TABLE, col)


def downgrade():
    conn = op.get_bind()
    existing_cols = _columns(conn)
    existing_idxs = _indexes(conn)

    # Restore with the original definitions from 6d2a4f0be9c1.
    # dots_blanked must have a server_default so the NOT NULL constraint
    # doesn't reject rows inserted without it.
    definitions = {
        'dots_blanked': sa.Column('dots_blanked', sa.Integer(), nullable=False, server_default='0'),
        'blanked_at_night_number': sa.Column('blanked_at_night_number', sa.Integer(), nullable=True),
        'release_night_number': sa.Column('release_night_number', sa.Integer(), nullable=True),
    }
    for col in _LEGACY_COLUMNS:
        if col not in existing_cols:
            op.add_column(_TABLE, definitions[col])

    if _LEGACY_INDEX not in existing_idxs:
        op.create_index(_LEGACY_INDEX, _TABLE, ['release_night_number'])
