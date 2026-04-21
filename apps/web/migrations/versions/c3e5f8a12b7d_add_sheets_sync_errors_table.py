"""add sheets_sync_errors table

Revision ID: c3e5f8a12b7d
Revises: 8c2f4a1d9b6e
Create Date: 2026-04-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3e5f8a12b7d'
down_revision = '8c2f4a1d9b6e'
branch_labels = None
depends_on = None


def _table_exists(name):
    conn = op.get_bind()
    return conn.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name=:t"),
        {'t': name},
    ).fetchone() is not None


def upgrade():
    if _table_exists('sheets_sync_errors'):
        return
    op.create_table(
        'sheets_sync_errors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('timestamp', sa.String(30), nullable=False, server_default=''),
        sa.Column('operation', sa.String(100), nullable=False, server_default=''),
        sa.Column('error', sa.Text(), nullable=False, server_default=''),
        sa.Column('details', sa.Text(), nullable=False, server_default=''),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('sheets_sync_errors', schema=None) as batch_op:
        batch_op.create_index('ix_sheets_sync_errors_timestamp', ['timestamp'], unique=False)


def downgrade():
    with op.batch_alter_table('sheets_sync_errors', schema=None) as batch_op:
        batch_op.drop_index('ix_sheets_sync_errors_timestamp')
    op.drop_table('sheets_sync_errors')
