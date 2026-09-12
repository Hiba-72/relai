import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.ticket import (
    TicketNature,
    TicketPriorite,
    TicketProbleme,
    TicketStatut,
)
from app.models.ticket_action import TicketActionKind
from app.schemas.equipement import EquipementRead
from app.schemas.poste import PosteRead
from app.schemas.service import ServiceRead
from app.schemas.user import UserRead


class TicketCreate(BaseModel):
    titre: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)
    nature: TicketNature
    priorite: TicketPriorite = TicketPriorite.NORMAL
    service_id: uuid.UUID
    # Many affected assets allowed; optional contextual poste pointer.
    equipement_ids: list[uuid.UUID] = Field(default_factory=list)
    poste_id: uuid.UUID | None = None
    assigned_to: uuid.UUID | None = None


class TicketUpdate(BaseModel):
    """Tech-facing edit of a ticket's core fields.

    Status is intentionally NOT here — it goes through /status which enforces
    transition rules. Same for assignment which has its own endpoint.
    """
    titre: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1)
    nature: TicketNature | None = None
    priorite: TicketPriorite | None = None


class TicketRead(BaseModel):
    id: uuid.UUID
    # Human-facing ticket number. The UUID stays the API identifier.
    numero: int
    titre: str
    description: str
    nature: TicketNature
    priorite: TicketPriorite
    statut: TicketStatut
    probleme_type: TicketProbleme | None = None
    service_id: uuid.UUID
    poste_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    archived_at: datetime | None = None
    created_by_user: UserRead = Field(alias="created_by_user")
    assigned_to_user: UserRead | None = Field(default=None, alias="assigned_to_user")
    service: ServiceRead
    poste: PosteRead | None
    equipements: list[EquipementRead] = Field(default_factory=list)

    model_config = {"from_attributes": True, "populate_by_name": True}


class TicketActionCreate(BaseModel):
    description: str = Field(min_length=1)


class TicketActionRead(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    description: str
    # 'commentaire' = written by a person; 'statut'/'assignation' = written by
    # the server. Lets the UI render the audit trail distinctly from the
    # conversation.
    kind: TicketActionKind
    created_by_user: UserRead
    created_at: datetime

    model_config = {"from_attributes": True}


class TicketAssign(BaseModel):
    assigned_to: uuid.UUID


class TicketStatusChange(BaseModel):
    statut: TicketStatut


class TicketDetail(TicketRead):
    actions: list[TicketActionRead] = Field(default_factory=list)


class TicketDemandeurCreate(BaseModel):
    """Minimal payload the demandeur UI sends.

    - ``probleme`` is the only required field.
    - ``equipement_id`` is optional (one asset, from their poste or their service).
    - ``commentaire`` is a single optional free-text note.

    Service and poste are pulled from the demandeur's account server-side.
    Priority is computed, never sent by the client.
    """
    probleme: TicketProbleme
    equipement_id: uuid.UUID | None = None
    commentaire: str | None = Field(default=None, max_length=2000)
