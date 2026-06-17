"""add coterie_id to spend_requests

Revision ID: 3e7f1a2b9c5d
Revises: 2b8f3c1a9e4d
Create Date: 2026-06-17 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3e7f1a2b9c5d'
down_revision = '2b8f3c1a9e4d'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_cols = {c['name'] for c in inspector.get_columns('spend_requests')}
    if 'coterie_id' not in existing_cols:
        with op.batch_alter_table('spend_requests', schema=None) as batch_op:
            batch_op.add_column(sa.Column('coterie_id', sa.Integer(), nullable=True))
            batch_op.create_index('ix_spend_requests_coterie_id', ['coterie_id'], unique=False)
            batch_op.create_foreign_key(
                'fk_spend_requests_coterie_id',
                'coteries', ['coterie_id'], ['id'],
            )


def downgrade():
    with op.batch_alter_table('spend_requests', schema=None) as batch_op:
        batch_op.drop_constraint('fk_spend_requests_coterie_id', type_='foreignkey')
        batch_op.drop_index('ix_spend_requests_coterie_id')
        batch_op.drop_column('coterie_id')
