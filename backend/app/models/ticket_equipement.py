import uuid

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class TicketEquipement(Base):
    """Many-to-many association between tickets and equipements.

    A ticket can affect zero or more equipements (the ``poste_id`` on
    ``Ticket`` is a separate contextual pointer to a whole workstation).
    """

    __tablename__ = "ticket_equipements"

    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tickets.id", ondelete="CASCADE"),
        primary_key=True,
    )
    equipement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("equipements.id", ondelete="CASCADE"),
        primary_key=True,
    )
