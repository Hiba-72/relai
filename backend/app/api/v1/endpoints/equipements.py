import uuid
from datetime import datetime, timezone
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import require_admin, require_informaticien
from app.db.session import get_db
from app.models.equipement import Equipement, EquipementEtat, EquipementType
from app.models.equipement_history import EquipementHistory
from app.models.poste import Poste
from app.models.service import Service
from app.models.user import User
from app.schemas.equipement import EquipementCreate, EquipementRead, EquipementUpdate
from app.schemas.equipement_history import EquipementHistoryRead

# Human-readable French labels for the enum columns in the Excel export.
_TYPE_LABELS = {
    "pc": "PC",
    "ecran": "Écran",
    "imprimante": "Imprimante",
    "scanner": "Scanner",
    "switch": "Switch",
    "routeur": "Routeur",
    "onduleur": "Onduleur",
    "telephone": "Téléphone",
    "serveur": "Serveur",
    "autre": "Autre",
}

_ETAT_LABELS = {
    "operationnel": "Opérationnel",
    "en_panne": "En panne",
    "en_maintenance": "En maintenance",
    "reforme": "Réformé",
}

router = APIRouter(prefix="/equipements", tags=["equipements"])


# Fields whose changes we record in the equipement_history audit log.
# Per the architecture decision: every column change is tracked, so we list
# all user-mutable columns here. created_at is excluded (immutable).
_AUDITED_FIELDS = (
    "reference",
    "n_serie",
    "code_barre",
    "inventaire",
    "type",
    "marque",
    "modele",
    "service_id",
    "poste_id",
    "etat",
    "notes",
)


def _stringify(value):
    """Serialize a model value to a stable text representation for the audit log."""
    if value is None:
        return None
    if hasattr(value, "value"):  # enum
        return value.value
    return str(value)


async def _validate_poste(
    poste_id: uuid.UUID | None,
    service_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """If a poste is given, ensure it exists and belongs to the same service."""
    if poste_id is None:
        return
    result = await db.execute(select(Poste).where(Poste.id == poste_id))
    poste = result.scalar_one_or_none()
    if not poste:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Poste not found"
        )
    if poste.service_id != service_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le poste appartient à un autre service",
        )


@router.get("/", response_model=list[EquipementRead],
            dependencies=[Depends(require_informaticien)])
async def list_equipements(
    type: EquipementType | None = None,
    etat: EquipementEtat | None = None,
    service_id: uuid.UUID | None = None,
    poste_id: uuid.UUID | None = None,
    salle: str | None = None,
    sous_reseau: str | None = None,
    q: str | None = None,
    # Archived (etat=reforme) equipements are hidden from the default list
    # so retired assets don't clutter the day-to-day inventory view. They
    # remain visible when the caller explicitly filters etat=reforme or
    # passes include_archived=true.
    include_archived: bool = False,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Equipement)

    if type is not None:
        stmt = stmt.where(Equipement.type == type)
    if etat is not None:
        stmt = stmt.where(Equipement.etat == etat)
    elif not include_archived:
        stmt = stmt.where(Equipement.etat != EquipementEtat.REFORME)
    if service_id is not None:
        stmt = stmt.where(Equipement.service_id == service_id)
    if poste_id is not None:
        stmt = stmt.where(Equipement.poste_id == poste_id)

    if salle:
        stmt = stmt.join(Poste, Equipement.poste_id == Poste.id).where(
            Poste.salle.ilike(f"%{salle}%")
        )

    if sous_reseau:
        stmt = stmt.join(Service, Equipement.service_id == Service.id).where(
            Service.sous_reseau.ilike(f"%{sous_reseau}%")
        )

    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                Equipement.reference.ilike(like),
                Equipement.n_serie.ilike(like),
                Equipement.code_barre.ilike(like),
                Equipement.inventaire.ilike(like),
                Equipement.marque.ilike(like),
                Equipement.modele.ilike(like),
            )
        )

    stmt = stmt.order_by(Equipement.reference)

    result = await db.execute(stmt)
    return result.scalars().unique().all()


@router.get("/export.xlsx", dependencies=[Depends(require_informaticien)])
async def export_equipements_xlsx(db: AsyncSession = Depends(get_db)):
    """Stream the full equipement inventory as an .xlsx file.

    All assets, all columns. Used by the "Exporter" button on the Équipements
    page. Generated in-memory and streamed; no temp files on disk.
    """
    result = await db.execute(
        select(Equipement).order_by(Equipement.reference)
    )
    equipements = result.scalars().unique().all()

    wb = Workbook()
    ws = wb.active
    ws.title = "Inventaire"

    headers = [
        "Référence",
        "N° de série",
        "Code-barres",
        "Inventaire",
        "Type",
        "Marque",
        "Modèle",
        "État",
        "Service",
        "Sous-réseau",
        "Poste",
        "Salle",
        "Utilisateur",
        "Notes",
        "Date d'inscription",
    ]
    ws.append(headers)

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="4F46E5")
    header_align = Alignment(horizontal="left", vertical="center")
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_align

    for e in equipements:
        ws.append([
            e.reference,
            e.n_serie or "",
            e.code_barre or "",
            e.inventaire or "",
            _TYPE_LABELS.get(e.type.value, e.type.value),
            e.marque,
            e.modele,
            _ETAT_LABELS.get(e.etat.value, e.etat.value),
            e.service.nom if e.service else "",
            e.service.sous_reseau if e.service else "",
            e.poste.nom if e.poste else "",
            e.poste.salle if e.poste else "",
            e.poste.utilisateur if e.poste and e.poste.utilisateur else "",
            e.notes or "",
            e.created_at.strftime("%Y-%m-%d") if e.created_at else "",
        ])

    # Column widths — rough auto-fit (openpyxl has no real auto-fit).
    widths = [18, 22, 18, 18, 12, 14, 22, 16, 28, 18, 28, 22, 22, 30, 18]
    for col_idx, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(col_idx)].width = w

    # Freeze the header row so it stays visible on scroll.
    ws.freeze_panes = "A2"
    # Enable Excel's auto-filter on all columns.
    ws.auto_filter.ref = ws.dimensions

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    filename = f"inventaire_{today}.xlsx"
    return StreamingResponse(
        buffer,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{equipement_id}", response_model=EquipementRead,
            dependencies=[Depends(require_informaticien)])
async def get_equipement(equipement_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Equipement).where(Equipement.id == equipement_id))
    equipement = result.scalar_one_or_none()
    if not equipement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipement not found")
    return equipement


@router.get("/{equipement_id}/history", response_model=list[EquipementHistoryRead],
            dependencies=[Depends(require_informaticien)])
async def get_equipement_history(
    equipement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EquipementHistory)
        .where(EquipementHistory.equipement_id == equipement_id)
        .order_by(EquipementHistory.changed_at.desc())
    )
    return result.scalars().unique().all()


@router.post("/", response_model=EquipementRead, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_informaticien)])
async def create_equipement(
    payload: EquipementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_informaticien),
):
    # Uniqueness checks across the three identifier columns.
    for column, label, value in (
        (Equipement.reference, "reference", payload.reference),
        (Equipement.n_serie, "n_serie", payload.n_serie),
        (Equipement.code_barre, "code_barre", payload.code_barre),
        (Equipement.inventaire, "inventaire", payload.inventaire),
    ):
        if value is None:
            continue
        existing = await db.execute(select(Equipement).where(column == value))
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"{label} déjà utilisé",
            )

    await _validate_poste(payload.poste_id, payload.service_id, db)

    equipement = Equipement(**payload.model_dump())
    db.add(equipement)
    await db.flush()

    # Initial creation isn't audited per-field (the row itself is the
    # canonical record); subsequent changes get logged.
    _ = current_user

    result = await db.execute(select(Equipement).where(Equipement.id == equipement.id))
    return result.scalar_one()


@router.patch("/{equipement_id}", response_model=EquipementRead,
              dependencies=[Depends(require_informaticien)])
async def update_equipement(
    equipement_id: uuid.UUID,
    payload: EquipementUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_informaticien),
):
    result = await db.execute(select(Equipement).where(Equipement.id == equipement_id))
    equipement = result.scalar_one_or_none()
    if not equipement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipement not found")

    update_data = payload.model_dump(exclude_unset=True)

    # Uniqueness checks for changed identifier values.
    for col_name, column in (
        ("reference", Equipement.reference),
        ("n_serie", Equipement.n_serie),
        ("code_barre", Equipement.code_barre),
        ("inventaire", Equipement.inventaire),
    ):
        if col_name in update_data and update_data[col_name] is not None:
            existing = await db.execute(
                select(Equipement).where(
                    column == update_data[col_name],
                    Equipement.id != equipement.id,
                )
            )
            if existing.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"{col_name} déjà utilisé",
                )

    # If service or poste is changing, validate the pair.
    target_service_id = update_data.get("service_id", equipement.service_id)
    if "poste_id" in update_data:
        await _validate_poste(update_data["poste_id"], target_service_id, db)
    elif "service_id" in update_data and equipement.poste_id is not None:
        # Service changed but poste kept; re-validate they still match.
        await _validate_poste(equipement.poste_id, target_service_id, db)

    # Record audit entries for every changed audited field.
    history_rows: list[EquipementHistory] = []
    for field in _AUDITED_FIELDS:
        if field not in update_data:
            continue
        old_value = getattr(equipement, field)
        new_value = update_data[field]
        if old_value == new_value:
            continue
        history_rows.append(
            EquipementHistory(
                equipement_id=equipement.id,
                changed_by=current_user.id,
                field=field,
                old_value=_stringify(old_value),
                new_value=_stringify(new_value),
            )
        )
        setattr(equipement, field, new_value)

    for row in history_rows:
        db.add(row)

    await db.flush()
    result = await db.execute(select(Equipement).where(Equipement.id == equipement.id))
    return result.scalar_one()


@router.delete("/{equipement_id}", response_model=EquipementRead,
               dependencies=[Depends(require_admin)])
async def archive_equipement(
    equipement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Soft-archive: flip etat to REFORME. The row stays in the DB with its
    history; the default list endpoint hides it. Reversible via the state
    dropdown on the detail page."""
    result = await db.execute(select(Equipement).where(Equipement.id == equipement_id))
    equipement = result.scalar_one_or_none()
    if not equipement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipement not found")

    if equipement.etat != EquipementEtat.REFORME:
        db.add(
            EquipementHistory(
                equipement_id=equipement.id,
                changed_by=current_user.id,
                field="etat",
                old_value=_stringify(equipement.etat),
                new_value=_stringify(EquipementEtat.REFORME),
            )
        )
        equipement.etat = EquipementEtat.REFORME

    await db.flush()
    result = await db.execute(select(Equipement).where(Equipement.id == equipement.id))
    return result.scalar_one()


@router.delete("/{equipement_id}/permanent",
               status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_admin)])
async def hard_delete_equipement(
    equipement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Hard-delete: remove the row and its history from the DB.

    ``ticket_equipements`` (M2M join) is ON DELETE CASCADE, so linked
    tickets stay but lose their reference to this asset. Irreversible —
    use archive for anything that might come back.
    """
    result = await db.execute(select(Equipement).where(Equipement.id == equipement_id))
    equipement = result.scalar_one_or_none()
    if not equipement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipement not found")

    # History rows also cascade (ondelete="CASCADE" on equipement_history).
    _ = current_user
    await db.delete(equipement)
    await db.flush()
    return None
