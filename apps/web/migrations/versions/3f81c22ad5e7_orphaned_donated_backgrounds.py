"""donated backgrounds outlive the character who donated them

A donation is normally a loan — undonating and staff's remove_member both hand
it straight back. When the donor retires or dies the coterie keeps the asset
instead, and a remaining member may buy it at standard price to take ownership.

`character_backgrounds.orphaned_from` holds the departed donor's name (non-null
means "buyable"), so provenance survives the transfer of `character_name` to
the buyer. `spend_requests.purchased_background_id` links a purchase to the row
it buys — resolving it from (coterie_id, background_key) would be ambiguous
when two departed donors each donated the same background to one coterie.

Revision ID: 3f81c22ad5e7
Revises: 7c4d9e1b2a06
Create Date: 2026-09-10

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3f81c22ad5e7'
down_revision = '7c4d9e1b2a06'
branch_labels = None
depends_on = None


_ADDITIONS = (
    ('character_backgrounds', 'orphaned_from', sa.String(200), True),
    ('character_backgrounds', 'orphaned_at', sa.String(20), False),
    ('spend_requests', 'purchased_background_id', sa.Integer(), True),
)


def _columns(inspector, table):
    return {c['name'] for c in inspector.get_columns(table)}


def upgrade():
    # db.create_all() runs before Alembic's diff on every boot, so against a
    # fresh database these columns already exist by the time the migration
    # runs. Guard per column rather than relying on autogenerate.
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = set(inspector.get_table_names())

    for table, column, type_, indexed in _ADDITIONS:
        if table not in tables or column in _columns(inspector, table):
            continue
        op.add_column(table, sa.Column(column, type_, nullable=True))
        if indexed:
            op.create_index(f'ix_{table}_{column}', table, [column])


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = set(inspector.get_table_names())

    for table, column, _type, indexed in reversed(_ADDITIONS):
        if table not in tables or column not in _columns(inspector, table):
            continue
        if indexed:
            existing = {i['name'] for i in inspector.get_indexes(table)}
            if f'ix_{table}_{column}' in existing:
                op.drop_index(f'ix_{table}_{column}', table_name=table)
        op.drop_column(table, column)
