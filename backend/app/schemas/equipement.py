import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.equipement import EquipementEtat, EquipementType
from app.schemas.poste import PosteRead
from app.schemas.service import ServiceRead


class EquipementCreate(BaseModel):
    reference: str = Field(min_length=1, max_length=50)
    n_serie: str | None = Field(default=None, max_length=100)
    code_barre: str | None = Field(default=None, max_length=100)
    inventaire: str | None = Field(default=None, max_length=100)
    type: EquipementType
    marque: str = Field(default="", max_length=100)
    modele: str = Field(default="", max_length=150)
    service_id: uuid.UUID
    poste_id: uuid.UUID | None = None
    etat: EquipementEtat = EquipementEtat.OPERATIONNEL
    processeur: str | None = Field(default=None, max_length=100)
    ram_go: int | None = Field(default=None, ge=0)
    disque_go: int | None = Field(default=None, ge=0)
    systeme_exploitation: str | None = Field(default=None, max_length=100)
    ecran_pouces: int | None = Field(default=None, ge=0)
    notes: str | None = None


class EquipementUpdate(BaseModel):
    reference: str | None = Field(default=None, min_length=1, max_length=50)
    n_serie: str | None = Field(default=None, max_length=100)
    code_barre: str | None = Field(default=None, max_length=100)
    inventaire: str | None = Field(default=None, max_length=100)
    type: EquipementType | None = None
    marque: str | None = Field(default=None, max_length=100)
    modele: str | None = Field(default=None, max_length=150)
    service_id: uuid.UUID | None = None
    poste_id: uuid.UUID | None = None
    etat: EquipementEtat | None = None
    processeur: str | None = Field(default=None, max_length=100)
    ram_go: int | None = Field(default=None, ge=0)
    disque_go: int | None = Field(default=None, ge=0)
    systeme_exploitation: str | None = Field(default=None, max_length=100)
    ecran_pouces: int | None = Field(default=None, ge=0)
    notes: str | None = None


class EquipementRead(BaseModel):
    id: uuid.UUID
    reference: str
    n_serie: str | None
    code_barre: str | None
    inventaire: str | None
    type: EquipementType
    marque: str
    modele: str
    service_id: uuid.UUID
    poste_id: uuid.UUID | None
    etat: EquipementEtat
    processeur: str | None
    ram_go: int | None
    disque_go: int | None
    systeme_exploitation: str | None
    ecran_pouces: int | None
    notes: str | None
    created_at: datetime
    service: ServiceRead
    poste: PosteRead | None

    model_config = {"from_attributes": True}
