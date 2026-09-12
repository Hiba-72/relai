import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.service import ServiceRead


class PosteCreate(BaseModel):
    nom: str = Field(min_length=1, max_length=100)
    salle: str = Field(min_length=1, max_length=50)
    utilisateur: str | None = Field(default=None, max_length=150)
    service_id: uuid.UUID
    notes: str | None = None


class PosteUpdate(BaseModel):
    nom: str | None = Field(default=None, min_length=1, max_length=100)
    salle: str | None = Field(default=None, min_length=1, max_length=50)
    utilisateur: str | None = Field(default=None, max_length=150)
    service_id: uuid.UUID | None = None
    notes: str | None = None


class PosteRead(BaseModel):
    id: uuid.UUID
    nom: str
    salle: str
    utilisateur: str | None
    service_id: uuid.UUID
    notes: str | None
    created_at: datetime
    service: ServiceRead

    model_config = {"from_attributes": True}
