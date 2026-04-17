"""add status field to characters

Revision ID: e5a2f8b31c9d
Revises: d4f1e9c23a8b
Create Date: 2026-04-17

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e5a2f8b31c9d'
down_revision = 'd4f1e9c23a8b'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('characters') as batch_op:
        batch_op.add_column(
            sa.Column('status', sa.String(20), nullable=True, server_default='active')
        )
        batch_op.create_index('ix_characters_status', ['status'])


def downgrade():
    with op.batch_alter_table('characters') as batch_op:
        batch_op.drop_index('ix_characters_status')
        batch_op.drop_column('status')
