import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class EquipementType(str, PyEnum):
    PC = "pc"
    ECRAN = "ecran"
    IMPRIMANTE = "imprimante"
    SCANNER = "scanner"
    SWITCH = "switch"
    ROUTEUR = "routeur"
    ONDULEUR = "onduleur"
    TELEPHONE = "telephone"
    SERVEUR = "serveur"
    AUTRE = "autre"


class EquipementEtat(str, PyEnum):
    OPERATIONNEL = "operationnel"
    EN_PANNE = "en_panne"
    EN_MAINTENANCE = "en_maintenance"
    REFORME = "reforme"


class Equipement(Base):
    __tablename__ = "equipements"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # User-facing primary identifier (printed on stickers etc). Unique when
    # set, but nullable since some legacy assets won't have one recorded yet.
    n_serie: Mapped[str | None] = mapped_column(
        String(100), unique=True, nullable=True, index=True
    )
    code_barre: Mapped[str | None] = mapped_column(
        String(100), unique=True, nullable=True, index=True
    )
    inventaire: Mapped[str | None] = mapped_column(
        String(100), unique=True, nullable=True, index=True
    )
    # Free-text human reference (kept for backwards compatibility & display).
    reference: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    type: Mapped[EquipementType] = mapped_column(Enum(EquipementType), nullable=False)
    marque: Mapped[str] = mapped_column(String(100), nullable=False)
    modele: Mapped[str] = mapped_column(String(150), nullable=False)
    service_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("services.id"), nullable=False
    )
    poste_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("postes.id"), nullable=True, index=True
    )
    etat: Mapped[EquipementEtat] = mapped_column(
        Enum(EquipementEtat), nullable=False, default=EquipementEtat.OPERATIONNEL
    )
    # Extended technical spec fields — populated from the CSV where present.
    # All nullable because they only apply to specific equipement types:
    # processor/ram/disk/OS for PCs and servers, screen size for monitors.
    processeur: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ram_go: Mapped[int | None] = mapped_column(Integer, nullable=True)
    disque_go: Mapped[int | None] = mapped_column(Integer, nullable=True)
    systeme_exploitation: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ecran_pouces: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    service: Mapped["Service"] = relationship(lazy="joined")  # noqa: F821
    poste: Mapped["Poste | None"] = relationship(lazy="joined")  # noqa: F821
