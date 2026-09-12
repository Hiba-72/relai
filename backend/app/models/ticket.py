import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Enum, ForeignKey, Identity, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class TicketNature(str, PyEnum):
    TECHNIQUE = "technique"
    METIER = "metier"
    ASSISTANCE = "assistance"
    MAINTENANCE = "maintenance"


class TicketPriorite(str, PyEnum):
    URGENT = "urgent"
    NORMAL = "normal"
    FAIBLE = "faible"


class TicketStatut(str, PyEnum):
    NOUVEAU = "nouveau"
    EN_COURS = "en_cours"
    RESOLU = "resolu"
    CLOTURE = "cloture"
    ANNULE = "annule"


# Simplified problem categories a demandeur can pick without technical training.
# Techs never see or set this; it is only populated for tickets created via the
# demandeur endpoint.
class TicketProbleme(str, PyEnum):
    EQUIPEMENT_PANNE = "equipement_panne"
    RESEAU_ABSENT = "reseau_absent"
    LOGICIEL_BLOQUE = "logiciel_bloque"
    IMPRESSION = "impression"
    INSTALLATION = "installation"
    AUTRE = "autre"


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # What people actually say out loud — "ticket 214". The UUID stays the
    # API identifier; this is for humans, and is never reused.
    # An IDENTITY column, not a bare sequence + server_default: the database
    # generates the value, so two techs filing at the same instant can't be
    # handed the same number, and both SQLAlchemy and Alembic model identity
    # explicitly on each side — so `alembic check` compares it reliably
    # instead of guessing whether a default means SERIAL.
    numero: Mapped[int] = mapped_column(
        Integer,
        Identity(always=False, start=1),
        unique=True,
        nullable=False,
        index=True,
    )
    titre: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    nature: Mapped[TicketNature] = mapped_column(Enum(TicketNature), nullable=False)
    priorite: Mapped[TicketPriorite] = mapped_column(
        Enum(TicketPriorite), nullable=False, default=TicketPriorite.NORMAL
    )
    statut: Mapped[TicketStatut] = mapped_column(
        Enum(TicketStatut), nullable=False, default=TicketStatut.NOUVEAU
    )
    # Only set for tickets opened via the demandeur endpoint; NULL for the
    # existing tech-created flow.
    probleme_type: Mapped[TicketProbleme | None] = mapped_column(
        Enum(TicketProbleme), nullable=True
    )
    service_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("services.id"), nullable=False
    )
    # Contextual pointer to a whole workstation. The authoritative list of
    # affected assets is the equipements many-to-many relation below; this
    # field just records "the incident happened at <workstation>".
    poste_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("postes.id"), nullable=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(nullable=True)
    archived_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    service: Mapped["Service"] = relationship(lazy="joined")  # noqa: F821
    poste: Mapped["Poste | None"] = relationship(lazy="joined")  # noqa: F821
    equipements: Mapped[list["Equipement"]] = relationship(  # noqa: F821
        secondary="ticket_equipements",
        lazy="selectin",
    )
    created_by_user: Mapped["User"] = relationship(  # noqa: F821
        foreign_keys=[created_by], lazy="joined"
    )
    assigned_to_user: Mapped["User | None"] = relationship(  # noqa: F821
        foreign_keys=[assigned_to], lazy="joined"
    )
