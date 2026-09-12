"""add ticket archive columns

Adds ``archived_at`` and ``archived_by`` to the tickets table so an admin can
soft-archive resolved / closed tickets out of the main lists without losing
history.

Revision ID: b2d5f9a3c1e4
Revises: a1c4e2f8b5d3
Create Date: 2026-07-11 10:00:00+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2d5f9a3c1e4'
down_revision: Union[str, Sequence[str], None] = 'a1c4e2f8b5d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tickets', sa.Column('archived_at', sa.DateTime(), nullable=True))
    op.add_column('tickets', sa.Column('archived_by', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_tickets_archived_by_users',
        'tickets', 'users',
        ['archived_by'], ['id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_tickets_archived_by_users', 'tickets', type_='foreignkey')
    op.drop_column('tickets', 'archived_by')
    op.drop_column('tickets', 'archived_at')
