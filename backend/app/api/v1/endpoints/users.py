import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_admin, require_informaticien
from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.models.poste import Poste
from app.models.user import Role, User
from app.schemas.user import (
    PasswordChangeRequest,
    PasswordResetRequest,
    UserCreate,
    UserRead,
    UserUpdate,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/", response_model=list[UserRead], dependencies=[Depends(require_informaticien)])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.full_name))
    return result.scalars().all()


async def _validate_poste_for_role(
    role: Role, poste_id: uuid.UUID | None, db: AsyncSession
) -> uuid.UUID | None:
    """Demandeurs must be pinned to a poste; other roles cannot have one."""
    if role == Role.DEMANDEUR:
        if poste_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Un compte demandeur doit être rattaché à un poste.",
            )
        result = await db.execute(select(Poste).where(Poste.id == poste_id))
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Poste introuvable"
            )
        return poste_id
    # Non-demandeur roles: drop any accidentally supplied poste_id.
    return None


@router.post("/", response_model=UserRead, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_admin)])
async def create_user(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    poste_id = await _validate_poste_for_role(payload.role, payload.poste_id, db)

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        poste_id=poste_id,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.patch("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_own_password(
    payload: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Any authenticated user can change their own password.

    Requires the current password as a re-authentication step.
    """
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Mot de passe actuel incorrect",
        )
    if payload.new_password == payload.current_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le nouveau mot de passe doit être différent de l'actuel",
        )
    current_user.hashed_password = hash_password(payload.new_password)
    await db.flush()


@router.patch("/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT,
              dependencies=[Depends(require_admin)])
async def reset_user_password(
    user_id: uuid.UUID,
    payload: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: reset another user's password without knowing the old one.

    Use case: tech forgets their password, admin sets a new one and tells them.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.hashed_password = hash_password(payload.new_password)
    await db.flush()


@router.patch("/{user_id}", response_model=UserRead, dependencies=[Depends(require_admin)])
async def update_user(user_id: uuid.UUID, payload: UserUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    update_data = payload.model_dump(exclude_unset=True)

    if "email" in update_data and update_data["email"] != user.email:
        clash = await db.execute(
            select(User.id).where(
                User.email == update_data["email"], User.id != user_id
            )
        )
        if clash.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email déjà utilisé par un autre compte",
            )

    # Resolve the effective role + poste_id (either being changed together, or
    # only one of them, or neither) and validate as a pair.
    if "role" in update_data or "poste_id" in update_data:
        effective_role = update_data.get("role", user.role)
        effective_poste = update_data.get("poste_id", user.poste_id)
        update_data["poste_id"] = await _validate_poste_for_role(
            effective_role, effective_poste, db
        )

    for field, value in update_data.items():
        setattr(user, field, value)

    await db.flush()
    await db.refresh(user)
    return user
