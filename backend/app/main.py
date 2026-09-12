from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import router as api_v1_router
from app.core.config import settings
from app.db.session import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev-only convenience: bootstrap a fresh local DB to the latest schema
    # without running migrations. In production, schema changes go through
    # Alembic (`alembic upgrade head`), not this path.
    if settings.ENVIRONMENT == "development":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="Relai API",
    version="0.1.0",
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url=None,
    # Hide the OpenAPI schema in prod — no need to publish the full API
    # surface to anyone who can reach the server.
    openapi_url="/openapi.json" if settings.ENVIRONMENT == "development" else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_v1_router, prefix=settings.API_PREFIX)


@app.get("/health")
async def health():
    return {"status": "ok"}
