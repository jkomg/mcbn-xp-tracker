"""add power_name to spend_requests

Revision ID: a4d1e8f2b7c3
Revises: 781ba6f04870
Create Date: 2026-06-02

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a4d1e8f2b7c3'
down_revision = '781ba6f04870'
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    rows = conn.execute(sa.text(f'PRAGMA table_info("{table_name}")')).fetchall()
    return any(row[1] == column_name for row in rows)


def upgrade():
    if not _column_exists('spend_requests', 'power_name'):
        op.add_column(
            'spend_requests',
            sa.Column('power_name', sa.String(100), server_default='', nullable=False),
        )


def downgrade():
    op.drop_column('spend_requests', 'power_name')
