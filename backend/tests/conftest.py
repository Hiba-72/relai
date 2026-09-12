"""Test harness.

Runs against a real PostgreSQL database, not SQLite. The models lean on
Postgres-specific types (``UUID(as_uuid=True)``, native ``ENUM``) and the
priority/archive logic depends on server-side defaults, so SQLite would pass
tests that production would fail.

Schema is created once per session via ``Base.metadata.create_all``; every
test then runs against truncated tables, so tests stay order-independent.
"""

import os
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# Must be set before app.core.config is imported, and must not be
# "development" or the app lifespan would run create_all on its own engine.
os.environ.setdefault("ENVIRONMENT", "test")

from app.api.v1.deps import get_current_user  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.session import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.equipement import Equipement, EquipementType  # noqa: E402
from app.models.poste import Poste  # noqa: E402
from app.models.service import Etage, Service  # noqa: E402
from app.models.user import Role, User  # noqa: E402

DATABASE_URL = os.environ["DATABASE_URL"]

# NullPool: each test gets a fresh connection, so a failed test can't leave a
# poisoned one behind in the pool for the next.
engine = create_async_engine(DATABASE_URL, poolclass=NullPool)
TestSession = async_sessionmaker(engine, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _schema():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables():
    """Truncate every table between tests so ordering never matters."""
    async with engine.begin() as conn:
        tables = ", ".join(f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables))
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    yield


@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSession() as session:
        yield session


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """HTTP client bound to the ASGI app, sharing the test database."""

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with TestSession() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


# --- Domain fixtures -------------------------------------------------------

@pytest_asyncio.fixture
async def service(db: AsyncSession) -> Service:
    svc = Service(
        nom="Radiologie",
        sous_reseau="10.0.0.0/24",
        etage=Etage.RDC,
        niveau_criticite=1,
    )
    db.add(svc)
    await db.commit()
    return svc


@pytest_asyncio.fixture
async def poste(db: AsyncSession, service: Service) -> Poste:
    p = Poste(nom="PC-RADIO-01", salle="Salle 1", service_id=service.id)
    db.add(p)
    await db.commit()
    return p


@pytest_asyncio.fixture
async def equipement(db: AsyncSession, service: Service, poste: Poste) -> Equipement:
    eq = Equipement(
        reference="EQ-0001",
        type=EquipementType.PC,
        marque="Generic",
        modele="Model X",
        service_id=service.id,
        poste_id=poste.id,
    )
    db.add(eq)
    await db.commit()
    return eq


PASSWORD = "testpass123"


async def _make_user(db: AsyncSession, email: str, role: Role, **kw) -> User:
    user = User(
        email=email,
        full_name=email.split("@")[0],
        hashed_password=hash_password(PASSWORD),
        role=role,
        **kw,
    )
    db.add(user)
    await db.commit()
    return user


@pytest_asyncio.fixture
async def admin(db: AsyncSession) -> User:
    return await _make_user(db, "admin@relai-test.fr", Role.ADMIN)


@pytest_asyncio.fixture
async def tech(db: AsyncSession) -> User:
    return await _make_user(db, "tech@relai-test.fr", Role.INFORMATICIEN)


@pytest_asyncio.fixture
async def other_tech(db: AsyncSession) -> User:
    return await _make_user(db, "tech2@relai-test.fr", Role.INFORMATICIEN)


@pytest_asyncio.fixture
async def demandeur(db: AsyncSession, poste: Poste) -> User:
    return await _make_user(
        db, "nurse@relai-test.fr", Role.DEMANDEUR, poste_id=poste.id
    )


@pytest.fixture
def as_user(client: AsyncClient):
    """Authenticate the client as a given user by overriding the dependency.

    Bypasses the token round-trip so a broken login can't cascade into every
    other test failing. Token handling itself is covered in test_auth.py.
    """

    def _apply(user: User) -> AsyncClient:
        app.dependency_overrides[get_current_user] = lambda: user
        return client

    return _apply
