"""add coterie_invitations table

Invited characters are no longer added to a coterie outright — they hold a
pending invitation until they accept. Membership therefore keeps meaning
"has agreed and is contributing creation dots", so the creation budget and
every existing member query stay correct without a status filter.

Revision ID: 7c4d9e1b2a06
Revises: b9c54e8c57d1
Create Date: 2026-09-09

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7c4d9e1b2a06'
down_revision = 'b9c54e8c57d1'
branch_labels = None
depends_on = None


def upgrade():
    # db.create_all() runs before Alembic's diff on every boot, so against a
    # fresh database this table already exists by the time the migration runs.
    # Guard explicitly rather than relying on autogenerate.
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'coterie_invitations' in inspector.get_table_names():
        return

    op.create_table(
        'coterie_invitations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('coterie_id', sa.Integer(), sa.ForeignKey('coteries.id'), nullable=False),
        sa.Column('roster_character_id', sa.Integer(), sa.ForeignKey('characters.id'),
                  nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('invited_by', sa.String(200), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('responded_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('coterie_id', 'roster_character_id',
                            name='uq_coterie_invitation'),
    )
    op.create_index('ix_coterie_invitations_coterie_id',
                    'coterie_invitations', ['coterie_id'])
    op.create_index('ix_coterie_invitations_roster_character_id',
                    'coterie_invitations', ['roster_character_id'])
    op.create_index('ix_coterie_invitations_status',
                    'coterie_invitations', ['status'])


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'coterie_invitations' not in inspector.get_table_names():
        return
    op.drop_index('ix_coterie_invitations_status', table_name='coterie_invitations')
    op.drop_index('ix_coterie_invitations_roster_character_id',
                  table_name='coterie_invitations')
    op.drop_index('ix_coterie_invitations_coterie_id', table_name='coterie_invitations')
    op.drop_table('coterie_invitations')
