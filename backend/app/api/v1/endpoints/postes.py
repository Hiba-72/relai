import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import require_admin, require_informaticien
from app.db.session import get_db
from app.models.equipement import Equipement
from app.models.poste import Poste
from app.models.ticket import Ticket
from app.schemas.poste import PosteCreate, PosteRead, PosteUpdate

router = APIRouter(prefix="/postes", tags=["postes"])


@router.get("/", response_model=list[PosteRead],
            dependencies=[Depends(require_informaticien)])
async def list_postes(
    q: str | None = None,
    service_id: uuid.UUID | None = None,
    salle: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Poste)

    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                Poste.nom.ilike(like),
                Poste.salle.ilike(like),
                Poste.utilisateur.ilike(like),
            )
        )
    if service_id is not None:
        stmt = stmt.where(Poste.service_id == service_id)
    if salle:
        stmt = stmt.where(Poste.salle.ilike(f"%{salle}%"))

    stmt = stmt.order_by(Poste.salle, Poste.nom)
    result = await db.execute(stmt)
    return result.scalars().unique().all()


@router.get("/{poste_id}", response_model=PosteRead,
            dependencies=[Depends(require_informaticien)])
async def get_poste(poste_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Poste).where(Poste.id == poste_id))
    poste = result.scalar_one_or_none()
    if not poste:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Poste not found")
    return poste


@router.post("/", response_model=PosteRead, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_informaticien)])
async def create_poste(payload: PosteCreate, db: AsyncSession = Depends(get_db)):
    poste = Poste(**payload.model_dump())
    db.add(poste)
    await db.flush()
    result = await db.execute(select(Poste).where(Poste.id == poste.id))
    return result.scalar_one()


@router.patch("/{poste_id}", response_model=PosteRead,
              dependencies=[Depends(require_informaticien)])
async def update_poste(
    poste_id: uuid.UUID,
    payload: PosteUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Poste).where(Poste.id == poste_id))
    poste = result.scalar_one_or_none()
    if not poste:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Poste not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(poste, field, value)

    await db.flush()
    result = await db.execute(select(Poste).where(Poste.id == poste.id))
    return result.scalar_one()


@router.delete("/{poste_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_admin)])
async def delete_poste(poste_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """
    Refuses deletion if any equipements or tickets still reference the poste.
    Returns a 412 with counts so the UI can prompt the admin to reassign first
    rather than hitting a raw FK violation.
    """
    result = await db.execute(select(Poste).where(Poste.id == poste_id))
    poste = result.scalar_one_or_none()
    if not poste:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Poste not found")

    equipements = await db.scalar(
        select(func.count(Equipement.id)).where(Equipement.poste_id == poste_id)
    )
    tickets = await db.scalar(
        select(func.count(Ticket.id)).where(Ticket.poste_id == poste_id)
    )
    if (equipements or 0) + (tickets or 0) > 0:
        raise HTTPException(
            status.HTTP_412_PRECONDITION_FAILED,
            f"Poste utilisé : {equipements or 0} équipement(s), "
            f"{tickets or 0} ticket(s). Réaffectez-les avant de supprimer.",
        )

    await db.delete(poste)
    await db.flush()
