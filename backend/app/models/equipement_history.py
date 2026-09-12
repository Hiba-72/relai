import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class EquipementHistory(Base):
    """Append-only audit log of equipement changes.

    One row per changed field per update. Values are stored as text so we can
    capture any field type uniformly; the front end formats them for display.
    """

    __tablename__ = "equipement_history"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    equipement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("equipements.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    changed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    changed_at: Mapped[datetime] = mapped_column(server_default=func.now())
    field: Mapped[str] = mapped_column(String(50), nullable=False)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)

    changed_by_user: Mapped["User"] = relationship(lazy="joined")  # noqa: F821
