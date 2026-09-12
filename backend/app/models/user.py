import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Boolean, Enum, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Role(str, PyEnum):
    ADMIN = "admin"
    INFORMATICIEN = "informaticien"
    DEMANDEUR = "demandeur"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.INFORMATICIEN, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Only meaningful for demandeurs — pins the account to a physical workstation
    # so the ticket form can auto-scope service and equipements.
    poste_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("postes.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    poste: Mapped["Poste | None"] = relationship(lazy="joined")  # noqa: F821
