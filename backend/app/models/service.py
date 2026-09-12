import uuid
from enum import Enum as PyEnum

from sqlalchemy import Enum, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Etage(str, PyEnum):
    SOUS_SOL = "sous_sol"
    RDC = "rdc"
    ETAGE_1 = "etage_1"
    ETAGE_2 = "etage_2"


class Service(Base):
    __tablename__ = "services"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    nom: Mapped[str] = mapped_column(String(100), nullable=False)
    sous_reseau: Mapped[str] = mapped_column(String(20), nullable=False)
    etage: Mapped[Etage] = mapped_column(Enum(Etage), nullable=False)
    # Criticality bumps demandeur ticket priority. 0 = admin/non-clinical,
    # 3 = urgences / réanimation. Defaults to 1 for a middle-of-the-road unit.
    niveau_criticite: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
