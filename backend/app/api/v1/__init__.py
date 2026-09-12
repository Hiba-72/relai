from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth,
    equipements,
    postes,
    services,
    tickets,
    users,
)

router = APIRouter()
router.include_router(auth.router)
router.include_router(users.router)
router.include_router(services.router)
router.include_router(postes.router)
router.include_router(equipements.router)
router.include_router(tickets.router)
