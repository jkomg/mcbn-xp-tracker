"""add boons and contact threads tables

Revision ID: a3f7c92e6b1d
Revises: b2d6e91a4c73
Create Date: 2026-07-03

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a3f7c92e6b1d'
down_revision = 'b2d6e91a4c73'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'boons' not in existing_tables:
        op.create_table(
            'boons',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('creditor_character_id', sa.Integer(), sa.ForeignKey('characters.id'), nullable=False),
            sa.Column('debtor_character_id', sa.Integer(), sa.ForeignKey('characters.id'), nullable=False),
            sa.Column('tier', sa.String(20), nullable=False),
            sa.Column('reason', sa.Text(), nullable=True, default=''),
            sa.Column('status', sa.String(20), nullable=False, server_default='owed'),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('created_by_discord_id', sa.String(30), nullable=True, default=''),
            sa.Column('resolved_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_boons_creditor_status', 'boons', ['creditor_character_id', 'status'])
        op.create_index('ix_boons_debtor_status', 'boons', ['debtor_character_id', 'status'])

    if 'contact_threads' not in existing_tables:
        op.create_table(
            'contact_threads',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('last_message_at', sa.DateTime(), nullable=False),
        )
        op.create_index('ix_contact_threads_last_message_at', 'contact_threads', ['last_message_at'])

    if 'contact_participants' not in existing_tables:
        op.create_table(
            'contact_participants',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('thread_id', sa.Integer(), sa.ForeignKey('contact_threads.id'), nullable=False),
            sa.Column('character_id', sa.Integer(), sa.ForeignKey('characters.id'), nullable=False),
            sa.UniqueConstraint('thread_id', 'character_id', name='uq_contact_participant'),
        )
        op.create_index('ix_contact_participants_thread_id', 'contact_participants', ['thread_id'])
        op.create_index('ix_contact_participants_character_id', 'contact_participants', ['character_id'])

    if 'contact_messages' not in existing_tables:
        op.create_table(
            'contact_messages',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('thread_id', sa.Integer(), sa.ForeignKey('contact_threads.id'), nullable=False),
            sa.Column('sender_character_id', sa.Integer(), sa.ForeignKey('characters.id'), nullable=False),
            sa.Column('body', sa.Text(), nullable=True, default=''),
            sa.Column('sent_at', sa.DateTime(), nullable=False),
            sa.Column('discord_channel_id', sa.String(32), nullable=True),
            sa.Column('discord_message_id', sa.String(32), nullable=True),
        )
        op.create_index('ix_contact_messages_thread_id', 'contact_messages', ['thread_id'])
        op.create_index('ix_contact_messages_sender_character_id', 'contact_messages', ['sender_character_id'])
        op.create_index('ix_contact_messages_sent_at', 'contact_messages', ['sent_at'])


def downgrade():
    op.drop_index('ix_contact_messages_sent_at', table_name='contact_messages')
    op.drop_index('ix_contact_messages_sender_character_id', table_name='contact_messages')
    op.drop_index('ix_contact_messages_thread_id', table_name='contact_messages')
    op.drop_table('contact_messages')

    op.drop_index('ix_contact_participants_character_id', table_name='contact_participants')
    op.drop_index('ix_contact_participants_thread_id', table_name='contact_participants')
    op.drop_table('contact_participants')

    op.drop_index('ix_contact_threads_last_message_at', table_name='contact_threads')
    op.drop_table('contact_threads')

    op.drop_index('ix_boons_debtor_status', table_name='boons')
    op.drop_index('ix_boons_creditor_status', table_name='boons')
    op.drop_table('boons')
