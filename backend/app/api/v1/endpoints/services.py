import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models.equipement import Equipement
from app.models.poste import Poste
from app.models.service import Service
from app.models.ticket import Ticket
from app.schemas.service import (
    ServiceCreate,
    ServiceRead,
    ServiceUpdate,
    ServiceUsage,
)

router = APIRouter(prefix="/services", tags=["services"])


@router.get(
    "/",
    response_model=list[ServiceRead],
    dependencies=[Depends(get_current_user)],
)
async def list_services(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Service).order_by(Service.nom))
    return result.scalars().all()


@router.post(
    "/",
    response_model=ServiceRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_service(
    payload: ServiceCreate, db: AsyncSession = Depends(get_db)
):
    svc = Service(**payload.model_dump())
    db.add(svc)
    await db.flush()
    await db.refresh(svc)
    return svc


@router.patch(
    "/{service_id}",
    response_model=ServiceRead,
    dependencies=[Depends(require_admin)],
)
async def update_service(
    service_id: uuid.UUID,
    payload: ServiceUpdate,
    db: AsyncSession = Depends(get_db),
):
    svc = await db.get(Service, service_id)
    if not svc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(svc, k, v)
    await db.flush()
    await db.refresh(svc)
    return svc


@router.get(
    "/{service_id}/usage",
    response_model=ServiceUsage,
    dependencies=[Depends(require_admin)],
)
async def service_usage(
    service_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    """Count of FK references — admin checks before deciding to delete."""
    if not await db.get(Service, service_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service introuvable")
    postes = await db.scalar(
        select(func.count(Poste.id)).where(Poste.service_id == service_id)
    )
    equipements = await db.scalar(
        select(func.count(Equipement.id)).where(
            Equipement.service_id == service_id
        )
    )
    tickets = await db.scalar(
        select(func.count(Ticket.id)).where(Ticket.service_id == service_id)
    )
    return ServiceUsage(
        postes=postes or 0,
        equipements=equipements or 0,
        tickets=tickets or 0,
    )


@router.delete(
    "/{service_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_service(
    service_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    """
    Refuses deletion if any postes, equipements, or tickets still reference
    the service. The 412 detail enumerates the counts so the UI can prompt
    the admin to reassign first.
    """
    svc = await db.get(Service, service_id)
    if not svc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service introuvable")

    postes = await db.scalar(
        select(func.count(Poste.id)).where(Poste.service_id == service_id)
    )
    equipements = await db.scalar(
        select(func.count(Equipement.id)).where(
            Equipement.service_id == service_id
        )
    )
    tickets = await db.scalar(
        select(func.count(Ticket.id)).where(Ticket.service_id == service_id)
    )
    if (postes or 0) + (equipements or 0) + (tickets or 0) > 0:
        raise HTTPException(
            status.HTTP_412_PRECONDITION_FAILED,
            f"Service utilisé : {postes or 0} poste(s), "
            f"{equipements or 0} équipement(s), {tickets or 0} ticket(s). "
            "Réaffectez-les avant de supprimer.",
        )

    await db.delete(svc)
    await db.flush()
