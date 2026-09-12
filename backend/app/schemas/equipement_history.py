import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.user import UserRead


class EquipementHistoryRead(BaseModel):
    id: uuid.UUID
    equipement_id: uuid.UUID
    changed_at: datetime
    field: str
    old_value: str | None
    new_value: str | None
    changed_by_user: UserRead

    model_config = {"from_attributes": True}
