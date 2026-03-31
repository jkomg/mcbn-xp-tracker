"""add event polling indexes

Revision ID: 8c2f4a1d9b6e
Revises: 1a98b9a23904
Create Date: 2026-03-30 00:00:00.000000

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = '8c2f4a1d9b6e'
down_revision = '1a98b9a23904'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('xp_claims', schema=None) as batch_op:
        batch_op.create_index(
            'ix_xp_claims_status_timestamp', ['status', 'timestamp'], unique=False
        )
        batch_op.create_index(
            'ix_xp_claims_status_review_date', ['status', 'review_date'], unique=False
        )

    with op.batch_alter_table('spend_requests', schema=None) as batch_op:
        batch_op.create_index(
            'ix_spend_requests_status_timestamp', ['status', 'timestamp'], unique=False
        )
        batch_op.create_index(
            'ix_spend_requests_status_review_date', ['status', 'review_date'], unique=False
        )


def downgrade():
    with op.batch_alter_table('spend_requests', schema=None) as batch_op:
        batch_op.drop_index('ix_spend_requests_status_review_date')
        batch_op.drop_index('ix_spend_requests_status_timestamp')

    with op.batch_alter_table('xp_claims', schema=None) as batch_op:
        batch_op.drop_index('ix_xp_claims_status_review_date')
        batch_op.drop_index('ix_xp_claims_status_timestamp')
