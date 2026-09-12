import uuid

from pydantic import BaseModel, Field

from app.models.service import Etage


class ServiceRead(BaseModel):
    id: uuid.UUID
    nom: str
    sous_reseau: str
    etage: Etage
    niveau_criticite: int = 1

    model_config = {"from_attributes": True}


class ServiceCreate(BaseModel):
    nom: str = Field(..., min_length=1, max_length=100)
    sous_reseau: str = Field(..., min_length=1, max_length=20)
    etage: Etage
    # 0 = admin/non-clinical, 3 = urgences/réanimation. Used by the priority
    # scoring for demandeur-created tickets.
    niveau_criticite: int = Field(default=1, ge=0, le=3)


class ServiceUpdate(BaseModel):
    nom: str | None = Field(default=None, min_length=1, max_length=100)
    sous_reseau: str | None = Field(default=None, min_length=1, max_length=20)
    etage: Etage | None = None
    niveau_criticite: int | None = Field(default=None, ge=0, le=3)


class ServiceUsage(BaseModel):
    """How many records reference a service. Used to gate deletion."""
    postes: int
    equipements: int
    tickets: int
