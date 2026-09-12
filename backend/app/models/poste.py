import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Poste(Base):
    __tablename__ = "postes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    nom: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    salle: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    utilisateur: Mapped[str | None] = mapped_column(String(150), nullable=True, index=True)
    service_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("services.id"), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    service: Mapped["Service"] = relationship(lazy="joined")  # noqa: F821
