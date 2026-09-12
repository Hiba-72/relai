"""add demandeur ticketing

Introduces the fields needed for the demandeur (medical-staff) workflow:

- ``users.poste_id``: nullable FK — pins a demandeur account to a physical
  workstation so the ticket form can auto-scope service/equipements.
- ``services.niveau_criticite``: 0-3 integer used by the automatic priority
  scoring (Urgences=3 pushes scores up).
- ``tickets.probleme_type``: nullable enum — only set on tickets opened via
  the demandeur endpoint; NULL for legacy / tech-created tickets.

All columns are nullable (or have a server default) so no backfill is needed.

Revision ID: c3f7e1a9b8d2
Revises: b2d5f9a3c1e4
Create Date: 2026-07-16 10:00:00+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3f7e1a9b8d2'
down_revision: Union[str, Sequence[str], None] = 'b2d5f9a3c1e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Uppercase to match SQLAlchemy's default enum serialization (which sends
# the Python enum member NAME, not its value). All the other enums in this
# database follow the same convention — see 988adbf12037_baseline.py.
TICKET_PROBLEME_VALUES = (
    'EQUIPEMENT_PANNE',
    'RESEAU_ABSENT',
    'LOGICIEL_BLOQUE',
    'IMPRESSION',
    'INSTALLATION',
    'AUTRE',
)


def upgrade() -> None:
    # users.poste_id
    op.add_column('users', sa.Column('poste_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_users_poste_id_postes',
        'users', 'postes',
        ['poste_id'], ['id'],
    )

    # services.niveau_criticite (default 1 so existing rows land in the middle)
    op.add_column(
        'services',
        sa.Column(
            'niveau_criticite',
            sa.Integer(),
            nullable=False,
            server_default='1',
        ),
    )

    # tickets.probleme_type
    probleme_enum = sa.Enum(*TICKET_PROBLEME_VALUES, name='ticketprobleme')
    probleme_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'tickets',
        sa.Column('probleme_type', probleme_enum, nullable=True),
    )


def downgrade() -> None:
    op.drop_column('tickets', 'probleme_type')
    sa.Enum(name='ticketprobleme').drop(op.get_bind(), checkfirst=True)

    op.drop_column('services', 'niveau_criticite')

    op.drop_constraint('fk_users_poste_id_postes', 'users', type_='foreignkey')
    op.drop_column('users', 'poste_id')
