"""repair coterie schema for pre-stamped DBs

Revision ID: 2b8f3c1a9e4d
Revises: 1c45d20d519a
Create Date: 2026-06-15 00:00:00.000000

Idempotent repair migration: creates coterie tables and donated_coterie_id
if they are missing. Necessary for DBs that were stamped at 1c45d20d519a
via create_all() or a manual stamp and therefore never executed the original
upgrade() for that revision.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2b8f3c1a9e4d'
down_revision = '1c45d20d519a'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'coteries' not in existing_tables:
        op.create_table(
            'coteries',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('name', sa.String(200), nullable=False, unique=True),
            sa.Column('slug', sa.String(200), nullable=False, unique=True),
            sa.Column('description', sa.Text(), nullable=True, default=''),
            sa.Column('discord_channel_id', sa.String(50), nullable=True),
            sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
        )
        op.create_index('ix_coteries_slug', 'coteries', ['slug'])
        op.create_index('ix_coteries_status', 'coteries', ['status'])

    if 'coterie_members' not in existing_tables:
        op.create_table(
            'coterie_members',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('coterie_id', sa.Integer(), sa.ForeignKey('coteries.id'), nullable=False),
            sa.Column('roster_character_id', sa.Integer(), sa.ForeignKey('characters.id'), nullable=False),
            sa.Column('free_dots_remaining', sa.Integer(), nullable=False, server_default='2'),
            sa.Column('setup_complete', sa.Boolean(), nullable=False, server_default='0'),
            sa.Column('joined_at', sa.DateTime(), nullable=False),
            sa.UniqueConstraint('coterie_id', 'roster_character_id', name='uq_coterie_member'),
        )
        op.create_index('ix_coterie_members_coterie_id', 'coterie_members', ['coterie_id'])

    if 'coterie_advantages' not in existing_tables:
        op.create_table(
            'coterie_advantages',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('coterie_id', sa.Integer(), sa.ForeignKey('coteries.id'), nullable=False),
            sa.Column('name', sa.String(200), nullable=False),
            sa.Column('dots', sa.Integer(), nullable=False, server_default='1'),
            sa.Column('advantage_type', sa.String(20), nullable=False, server_default='background'),
            sa.Column('notes', sa.Text(), nullable=True, default=''),
            sa.Column('added_by', sa.String(200), nullable=False, server_default=''),
            sa.Column('created_at', sa.DateTime(), nullable=False),
        )
        op.create_index('ix_coterie_advantages_coterie_id', 'coterie_advantages', ['coterie_id'])

    existing_cols = {c['name'] for c in inspector.get_columns('character_backgrounds')}
    if 'donated_coterie_id' not in existing_cols:
        with op.batch_alter_table('character_backgrounds', schema=None) as batch_op:
            batch_op.add_column(sa.Column('donated_coterie_id', sa.Integer(), nullable=True))
            batch_op.create_index('ix_character_backgrounds_donated_coterie_id', ['donated_coterie_id'], unique=False)
            batch_op.create_foreign_key(
                'fk_character_backgrounds_donated_coterie_id',
                'coteries', ['donated_coterie_id'], ['id'],
            )


def downgrade():
    pass  # repair migration — no meaningful downgrade
