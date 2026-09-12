import uuid

from pydantic import BaseModel, EmailStr, Field

from app.models.user import Role


# --- Auth ---

class LoginRequest(BaseModel):
    email: EmailStr
    # Deliberately unconstrained. A length rule here would answer a short
    # password with 422 instead of 401, which both leaks the password policy
    # and lets an attacker tell "too short" apart from "wrong credentials".
    # Length is enforced where passwords are *set*, not where they're checked.
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# --- User ---

class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=8)
    role: Role = Role.INFORMATICIEN
    # Required for role=demandeur; ignored for other roles.
    poste_id: uuid.UUID | None = None


class UserRead(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: Role
    is_active: bool
    poste_id: uuid.UUID | None = None

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    role: Role | None = None
    is_active: bool | None = None
    poste_id: uuid.UUID | None = None


class PasswordChangeRequest(BaseModel):
    """Body for a user changing their own password."""
    current_password: str = Field(min_length=8)
    new_password: str = Field(min_length=8)


class PasswordResetRequest(BaseModel):
    """Body for an admin resetting another user's password."""
    new_password: str = Field(min_length=8)
