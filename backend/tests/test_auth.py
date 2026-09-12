"""Authentication and token handling.

Several of these pin behaviour that was wrong before: a non-UUID `sub` used to
surface as a 500, a short password as a 422, and a missing Authorization
header as a 403.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.models.user import User

from .conftest import PASSWORD


async def login(client: AsyncClient, email: str, password: str = PASSWORD):
    return await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )


class TestLogin:
    async def test_valid_credentials_return_token_pair(
        self, client: AsyncClient, tech: User
    ):
        res = await login(client, tech.email)
        assert res.status_code == 200
        body = res.json()
        assert body["access_token"] and body["refresh_token"]
        assert body["token_type"] == "bearer"

    async def test_wrong_password_is_401(self, client: AsyncClient, tech: User):
        res = await login(client, tech.email, "wrongpassword")
        assert res.status_code == 401

    async def test_unknown_email_is_401(self, client: AsyncClient):
        res = await login(client, "nobody@relai-test.fr")
        assert res.status_code == 401

    async def test_short_password_is_401_not_422(self, client: AsyncClient, tech: User):
        """A length rule on the login schema would answer 422 here.

        That leaks the password policy and lets an attacker tell "too short"
        apart from "wrong credentials". Authentication failures must be
        indistinguishable.
        """
        res = await login(client, tech.email, "short")
        assert res.status_code == 401

    async def test_wrong_password_and_unknown_email_are_indistinguishable(
        self, client: AsyncClient, tech: User
    ):
        a = await login(client, tech.email, "wrongpassword")
        b = await login(client, "nobody@relai-test.fr", "wrongpassword")
        assert a.status_code == b.status_code == 401
        assert a.json() == b.json()

    async def test_inactive_account_is_rejected(
        self, client: AsyncClient, db: AsyncSession, tech: User
    ):
        tech.is_active = False
        await db.commit()
        res = await login(client, tech.email)
        assert res.status_code == 403


class TestBearerToken:
    async def test_missing_header_is_401_not_403(self, client: AsyncClient):
        """RFC 6750: absent credentials is 401 with WWW-Authenticate.

        FastAPI's HTTPBearer defaults to 403, which also breaks the frontend —
        its axios interceptor only attempts a refresh on 401.
        """
        res = await client.get("/api/v1/auth/me")
        assert res.status_code == 401
        assert "www-authenticate" in {k.lower() for k in res.headers}

    async def test_garbage_token_is_401(self, client: AsyncClient):
        res = await client.get(
            "/api/v1/auth/me", headers={"Authorization": "Bearer not-a-jwt"}
        )
        assert res.status_code == 401

    async def test_non_uuid_subject_is_401_not_500(self, client: AsyncClient):
        """A forged token with a non-UUID `sub` used to raise ValueError,
        escaping as a 500 with a traceback."""
        token = create_access_token("i-am-not-a-uuid")
        res = await client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 401

    async def test_refresh_token_rejected_as_access_token(
        self, client: AsyncClient, tech: User
    ):
        """Token type confusion: a refresh token must not authenticate a request."""
        token = create_refresh_token(str(tech.id))
        res = await client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 401

    async def test_token_for_deleted_user_is_401(self, client: AsyncClient):
        token = create_access_token(str(uuid.uuid4()))
        res = await client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 401

    async def test_valid_token_returns_current_user(
        self, client: AsyncClient, tech: User
    ):
        token = create_access_token(str(tech.id))
        res = await client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 200
        assert res.json()["email"] == tech.email
        assert "hashed_password" not in res.json()


class TestRefresh:
    async def test_refresh_returns_new_pair(self, client: AsyncClient, tech: User):
        token = create_refresh_token(str(tech.id))
        res = await client.post("/api/v1/auth/refresh", json={"refresh_token": token})
        assert res.status_code == 200
        assert res.json()["access_token"]

    async def test_access_token_rejected_at_refresh(
        self, client: AsyncClient, tech: User
    ):
        token = create_access_token(str(tech.id))
        res = await client.post("/api/v1/auth/refresh", json={"refresh_token": token})
        assert res.status_code == 401

    async def test_deactivated_user_cannot_refresh(
        self, client: AsyncClient, db: AsyncSession, tech: User
    ):
        """Refresh tokens live for days. Without a re-check, disabling an
        account leaves it minting access tokens until natural expiry."""
        token = create_refresh_token(str(tech.id))
        tech.is_active = False
        await db.commit()

        res = await client.post("/api/v1/auth/refresh", json={"refresh_token": token})
        assert res.status_code == 401

    async def test_deleted_user_cannot_refresh(self, client: AsyncClient):
        token = create_refresh_token(str(uuid.uuid4()))
        res = await client.post("/api/v1/auth/refresh", json={"refresh_token": token})
        assert res.status_code == 401


class TestPasswordHashing:
    def test_hash_is_not_reversible_and_verifies(self):
        hashed = hash_password("correct horse battery staple")
        assert hashed != "correct horse battery staple"
        assert verify_password("correct horse battery staple", hashed)
        assert not verify_password("wrong", hashed)

    def test_same_password_hashes_differently(self):
        """Distinct salts — identical passwords must not produce identical hashes."""
        assert hash_password(PASSWORD) != hash_password(PASSWORD)
