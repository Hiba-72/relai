import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Enum, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class TicketActionKind(str, PyEnum):
    """What produced a timeline entry.

    Splitting these lets the UI render an audit trail and a conversation in
    one stream without letting either be mistaken for the other — a system
    line can't be forged by typing it into the comment box.
    """

    COMMENTAIRE = "commentaire"   # written by a person
    STATUT = "statut"             # status transition, written by the server
    ASSIGNATION = "assignation"   # assignment change, written by the server


class TicketAction(Base):
    __tablename__ = "ticket_actions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tickets.id"), nullable=False
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[TicketActionKind] = mapped_column(
        Enum(TicketActionKind),
        nullable=False,
        default=TicketActionKind.COMMENTAIRE,
        # SQLAlchemy's Enum persists member NAMES, not values, so the server
        # default must be "COMMENTAIRE" — "commentaire" is not a valid label
        # of the Postgres type and would be rejected on insert.
        server_default=TicketActionKind.COMMENTAIRE.name,
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    created_by_user: Mapped["User"] = relationship(lazy="joined")  # noqa: F821
