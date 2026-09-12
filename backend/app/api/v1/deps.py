import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import Role, User

# auto_error=False so a *missing* Authorization header reaches us instead of
# FastAPI raising its built-in 403. Per RFC 6750 an absent or invalid bearer
# token is 401 (+ WWW-Authenticate), not 403 — 403 means "authenticated but
# not allowed", which is what require_roles() below returns. The frontend
# also relies on this: its axios interceptor refreshes on 401 only.
bearer_scheme = HTTPBearer(auto_error=False)

UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid or expired token",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise UNAUTHENTICATED
    token = credentials.credentials
    try:
        user_id = decode_token(token, expected_type="access")
    except JWTError:
        raise UNAUTHENTICATED

    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        # A token whose `sub` isn't a UUID is malformed or forged — that's an
        # authentication failure, not a server error. Without this, the
        # ValueError escapes as a 500 and leaks a traceback.
        raise UNAUTHENTICATED

    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise UNAUTHENTICATED

    return user


def require_roles(*roles: Role):
    """Factory that returns a dependency enforcing role membership."""

    async def _guard(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return _guard


# Convenience aliases
require_admin = require_roles(Role.ADMIN)
require_informaticien = require_roles(Role.ADMIN, Role.INFORMATICIEN)
