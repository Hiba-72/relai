import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_admin, require_informaticien
from app.db.session import get_db
from app.models.equipement import Equipement
from app.models.poste import Poste
from app.models.service import Service
from app.models.ticket import (
    Ticket,
    TicketNature,
    TicketPriorite,
    TicketProbleme,
    TicketStatut,
)
from app.models.ticket_action import TicketAction, TicketActionKind
from app.models.ticket_equipement import TicketEquipement
from app.models.user import Role, User
from app.schemas.equipement import EquipementRead
from app.schemas.ticket import (
    TicketActionCreate,
    TicketActionRead,
    TicketAssign,
    TicketCreate,
    TicketDemandeurCreate,
    TicketDetail,
    TicketRead,
    TicketStatusChange,
    TicketUpdate,
)
from app.services.priority import (
    PROBLEM_LABEL,
    compute_priority,
)

router = APIRouter(prefix="/tickets", tags=["tickets"])


# Allowed status transitions (used both for validation and error messages).
#
# The terminal states are deliberately re-openable: "it broke again" and "that
# fix didn't hold" are the normal life of a helpdesk ticket, and forcing a
# duplicate ticket instead loses the history of what was already tried.
TRANSITIONS: dict[TicketStatut, list[TicketStatut]] = {
    TicketStatut.NOUVEAU: [TicketStatut.EN_COURS, TicketStatut.ANNULE],
    TicketStatut.EN_COURS: [TicketStatut.RESOLU, TicketStatut.ANNULE],
    # Reopen: the reported fix didn't actually work.
    TicketStatut.RESOLU: [TicketStatut.CLOTURE, TicketStatut.EN_COURS],
    # Reopen a closed ticket (admin only — see change_status).
    TicketStatut.CLOTURE: [TicketStatut.EN_COURS],
    # Un-cancel, back to the untriaged queue.
    TicketStatut.ANNULE: [TicketStatut.NOUVEAU],
}

# States from which moving back into the active workflow counts as a reopen.
REOPEN_FROM = (TicketStatut.RESOLU, TicketStatut.CLOTURE, TicketStatut.ANNULE)

STATUT_LABEL: dict[TicketStatut, str] = {
    TicketStatut.NOUVEAU: "Nouveau",
    TicketStatut.EN_COURS: "En cours",
    TicketStatut.RESOLU: "Résolu",
    TicketStatut.CLOTURE: "Clôturé",
    TicketStatut.ANNULE: "Annulé",
}


def _log_event(
    db: AsyncSession,
    ticket_id: uuid.UUID,
    user_id: uuid.UUID,
    kind: TicketActionKind,
    description: str,
) -> None:
    """Append a server-authored entry to the ticket timeline.

    Status and assignment changes were previously invisible: the only record
    was the current value plus a single ``resolved_at``, so "who cancelled
    this and when" had no answer. These entries are written by the server, and
    the ``kind`` column keeps them distinguishable from typed comments.
    """
    db.add(
        TicketAction(
            ticket_id=ticket_id,
            description=description,
            kind=kind,
            created_by=user_id,
        )
    )


async def _reload_ticket(ticket_id: uuid.UUID, db: AsyncSession) -> Ticket:
    """Re-read a ticket with its eager relationships refreshed.

    A plain re-select returns the instance already in the identity map, whose
    joined/selectin relationships still hold the values they had when it was
    first loaded. After changing `assigned_to`, that meant the response
    serialised `assigned_to_user` as null — the ticket looked unassigned right
    after a tech took it. populate_existing forces those to reload.
    """
    result = await db.execute(
        select(Ticket)
        .where(Ticket.id == ticket_id)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


async def _get_ticket_or_404(ticket_id: uuid.UUID, db: AsyncSession) -> Ticket:
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return ticket


def _enforce_visibility(ticket: Ticket, user: User) -> None:
    if user.role == Role.DEMANDEUR and ticket.created_by != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("/", response_model=list[TicketRead])
async def list_tickets(
    response: Response,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    statut: TicketStatut | None = None,
    nature: TicketNature | None = None,
    priorite: TicketPriorite | None = None,
    service_id: uuid.UUID | None = None,
    assigned_to: uuid.UUID | None = None,
    created_by: uuid.UUID | None = None,
    equipement_id: uuid.UUID | None = None,
    archived: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Ticket)

    if current_user.role == Role.DEMANDEUR:
        stmt = stmt.where(Ticket.created_by == current_user.id)

    # Archived tickets are hidden by default. Only admins may explicitly
    # request the archive; other roles never see archived rows.
    if archived and current_user.role == Role.ADMIN:
        stmt = stmt.where(Ticket.archived_at.is_not(None))
    else:
        stmt = stmt.where(Ticket.archived_at.is_(None))

    if statut is not None:
        stmt = stmt.where(Ticket.statut == statut)
    if nature is not None:
        stmt = stmt.where(Ticket.nature == nature)
    if priorite is not None:
        stmt = stmt.where(Ticket.priorite == priorite)
    if service_id is not None:
        stmt = stmt.where(Ticket.service_id == service_id)
    if assigned_to is not None:
        stmt = stmt.where(Ticket.assigned_to == assigned_to)
    if created_by is not None:
        stmt = stmt.where(Ticket.created_by == created_by)
    if equipement_id is not None:
        # Filter via the many-to-many join table.
        stmt = stmt.where(
            Ticket.id.in_(
                select(TicketEquipement.ticket_id).where(
                    TicketEquipement.equipement_id == equipement_id
                )
            )
        )

    # Total before slicing, so the client can show "showing 100 of 3204".
    # count() over the filtered subquery — not len() of the fetched rows.
    total = await db.scalar(
        select(func.count()).select_from(stmt.subquery())
    )
    response.headers["X-Total-Count"] = str(total or 0)

    # Newest first, with id as a tiebreaker: created_at alone is not unique
    # (bulk seeds land in the same millisecond) and a non-deterministic sort
    # makes rows repeat or vanish across pages.
    stmt = stmt.order_by(Ticket.created_at.desc(), Ticket.id.desc())
    stmt = stmt.limit(limit).offset(offset)

    result = await db.execute(stmt)
    return result.scalars().unique().all()


@router.get("/{ticket_id}", response_model=TicketDetail)
async def get_ticket(
    ticket_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ticket = await _get_ticket_or_404(ticket_id, db)
    _enforce_visibility(ticket, current_user)

    actions_result = await db.execute(
        select(TicketAction)
        .where(TicketAction.ticket_id == ticket_id)
        .order_by(TicketAction.created_at.asc())
    )
    actions = actions_result.scalars().unique().all()

    detail = TicketDetail.model_validate(ticket)
    detail.actions = [TicketActionRead.model_validate(a) for a in actions]
    return detail


async def _validate_poste(
    poste_id: uuid.UUID | None,
    service_id: uuid.UUID,
    db: AsyncSession,
) -> None:
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


async def _resolve_equipement_ids(
    equipement_ids: list[uuid.UUID],
    db: AsyncSession,
) -> list[uuid.UUID]:
    """Return the de-duplicated subset that actually exists; raise on unknowns."""
    if not equipement_ids:
        return []
    unique_ids = list(dict.fromkeys(equipement_ids))
    result = await db.execute(
        select(Equipement.id).where(Equipement.id.in_(unique_ids))
    )
    found = {row[0] for row in result.all()}
    missing = [str(i) for i in unique_ids if i not in found]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Équipements inconnus : {', '.join(missing)}",
        )
    return unique_ids


@router.post("/", response_model=TicketRead, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    payload: TicketCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Demandeurs go through POST /tickets/demandeur which builds the payload
    # server-side; refuse the full form to keep the priority scoring authoritative.
    if current_user.role == Role.DEMANDEUR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Les demandeurs utilisent le formulaire simplifié.",
        )

    data = payload.model_dump()
    equipement_ids = data.pop("equipement_ids", []) or []
    poste_id = data.get("poste_id")

    # Informaticiens can only pre-assign to themselves; admins are free.
    requested_assignee = data.get("assigned_to")
    if current_user.role == Role.INFORMATICIEN and requested_assignee is not None:
        if requested_assignee != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Un informaticien ne peut s'assigner qu'à lui-même",
            )

    await _validate_poste(poste_id, data["service_id"], db)
    resolved_equipement_ids = await _resolve_equipement_ids(equipement_ids, db)

    ticket = Ticket(
        **data,
        created_by=current_user.id,
    )
    db.add(ticket)
    await db.flush()

    for eid in resolved_equipement_ids:
        db.add(TicketEquipement(ticket_id=ticket.id, equipement_id=eid))
    await db.flush()

    # Re-fetch so joined / selectin relationships are loaded for the response.
    return await _reload_ticket(ticket.id, db)


@router.get(
    "/demandeur/equipements",
    response_model=list[EquipementRead],
)
async def list_equipements_for_demandeur(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Equipements the demandeur can attach to a ticket.

    Returns everything in their service, with their poste's assets first so the
    common case (a nurse reporting on kit at their own workstation) shows the
    right options at the top of the dropdown.
    """
    if current_user.role != Role.DEMANDEUR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Réservé aux comptes demandeur",
        )
    if current_user.poste_id is None:
        return []

    poste_result = await db.execute(
        select(Poste).where(Poste.id == current_user.poste_id)
    )
    poste = poste_result.scalar_one_or_none()
    if poste is None:
        return []

    result = await db.execute(
        select(Equipement)
        .where(Equipement.service_id == poste.service_id)
        # Poste-matched rows first (0), then the rest (1), then a stable order.
        .order_by(
            (Equipement.poste_id != poste.id),
            Equipement.type,
            Equipement.reference,
        )
    )
    return result.scalars().unique().all()


@router.post(
    "/demandeur",
    response_model=TicketRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_ticket_as_demandeur(
    payload: TicketDemandeurCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Slim ticket-creation path for medical staff (role=demandeur).

    The demandeur only picks a problem category and (optionally) one affected
    equipement + a free-text note. Service, poste, titre, description and
    priorité are derived server-side so the form stays approachable.
    """
    if current_user.role != Role.DEMANDEUR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Réservé aux comptes demandeur",
        )
    if current_user.poste_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Aucun poste n'est associé à votre compte. Contactez "
                "l'administrateur."
            ),
        )

    # The demandeur's poste anchors the service — no need to trust anything
    # from the client.
    poste_result = await db.execute(
        select(Poste).where(Poste.id == current_user.poste_id)
    )
    poste = poste_result.scalar_one_or_none()
    if poste is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Poste introuvable, contactez l'administrateur.",
        )

    service_result = await db.execute(
        select(Service).where(Service.id == poste.service_id)
    )
    service = service_result.scalar_one_or_none()
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Service introuvable pour ce poste",
        )

    equipement: Equipement | None = None
    if payload.equipement_id is not None:
        eq_result = await db.execute(
            select(Equipement).where(Equipement.id == payload.equipement_id)
        )
        equipement = eq_result.scalar_one_or_none()
        if equipement is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Équipement introuvable"
            )
        # Scope: their poste's assets or anything else in their service.
        if equipement.service_id != service.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cet équipement n'appartient pas à votre service.",
            )

    priorite = compute_priority(
        niveau_criticite=service.niveau_criticite,
        probleme=payload.probleme,
        equipements=[equipement] if equipement else [],
    )

    # Synthesise titre + description so the tech-facing views still show
    # meaningful text without demandeurs having to write any.
    label = PROBLEM_LABEL[payload.probleme]
    titre = f"{label} — {equipement.reference}" if equipement else label
    titre = titre[:200]

    lines: list[str] = [f"Type de problème : {label}"]
    lines.append(f"Poste : {poste.nom} ({poste.salle})")
    if equipement:
        lines.append(
            f"Équipement : {equipement.reference} — {equipement.marque} {equipement.modele}"
        )
    if payload.commentaire:
        lines.append("")
        lines.append(payload.commentaire.strip())
    description = "\n".join(lines)

    ticket = Ticket(
        titre=titre,
        description=description,
        nature=TicketNature.TECHNIQUE,
        priorite=priorite,
        probleme_type=payload.probleme,
        service_id=service.id,
        poste_id=poste.id,
        created_by=current_user.id,
    )
    db.add(ticket)
    await db.flush()

    if equipement is not None:
        db.add(TicketEquipement(ticket_id=ticket.id, equipement_id=equipement.id))
        await db.flush()

    return await _reload_ticket(ticket.id, db)


@router.patch("/{ticket_id}", response_model=TicketRead)
async def update_ticket(
    ticket_id: uuid.UUID,
    payload: TicketUpdate,
    current_user: User = Depends(require_informaticien),
    db: AsyncSession = Depends(get_db),
):
    """Tech-facing edit of core fields: titre, description, nature, priorité.

    Assigned techs and admins can edit; other informaticiens cannot touch a
    ticket that's not theirs (matches the actions/status permissions).
    """
    ticket = await _get_ticket_or_404(ticket_id, db)

    is_admin = current_user.role == Role.ADMIN
    if not is_admin and ticket.assigned_to not in (None, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ce ticket est assigné à un autre technicien",
        )

    data = payload.model_dump(exclude_unset=True)
    if not data:
        # No-op — return the current state without touching updated_at.
        return ticket

    for field, value in data.items():
        setattr(ticket, field, value)

    await db.flush()
    return await _reload_ticket(ticket.id, db)


@router.patch("/{ticket_id}/assign", response_model=TicketRead)
async def assign_ticket(
    ticket_id: uuid.UUID,
    payload: TicketAssign,
    current_user: User = Depends(require_informaticien),
    db: AsyncSession = Depends(get_db),
):
    ticket = await _get_ticket_or_404(ticket_id, db)

    if current_user.role == Role.INFORMATICIEN and payload.assigned_to != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Technicien can only assign tickets to themselves",
        )

    # Validate target user exists (and isn't a demandeur — only technicien/admin handle tickets).
    target_result = await db.execute(select(User).where(User.id == payload.assigned_to))
    target = target_result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignee not found")
    if target.role == Role.DEMANDEUR:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot assign a ticket to a demandeur",
        )

    # Assignment alone does NOT advance the status. The ticket only moves to
    # en_cours when the assigned tech explicitly takes it via "Prendre en charge".
    previous = ticket.assigned_to
    ticket.assigned_to = payload.assigned_to

    if previous != payload.assigned_to:
        _log_event(
            db,
            ticket.id,
            current_user.id,
            TicketActionKind.ASSIGNATION,
            f"Ticket assigné à {target.full_name}",
        )

    await db.flush()
    return await _reload_ticket(ticket.id, db)


@router.patch("/{ticket_id}/status", response_model=TicketRead)
async def change_status(
    ticket_id: uuid.UUID,
    payload: TicketStatusChange,
    current_user: User = Depends(require_informaticien),
    db: AsyncSession = Depends(get_db),
):
    ticket = await _get_ticket_or_404(ticket_id, db)

    current = ticket.statut
    target = payload.statut
    allowed = TRANSITIONS.get(current, [])

    if target not in allowed:
        allowed_str = ", ".join(s.value for s in allowed) or "(aucune)"
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Transition invalide. Transitions autorisées depuis "
                f"{current.value}: {allowed_str}"
            ),
        )

    is_admin = current_user.role == Role.ADMIN

    if current == TicketStatut.NOUVEAU and target == TicketStatut.EN_COURS:
        if ticket.assigned_to is None:
            ticket.assigned_to = current_user.id
        elif not is_admin and ticket.assigned_to != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Ce ticket est déjà assigné à un autre technicien",
            )
    elif current == TicketStatut.NOUVEAU and target == TicketStatut.ANNULE:
        if not is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    elif current == TicketStatut.EN_COURS and target == TicketStatut.RESOLU:
        if not is_admin and ticket.assigned_to != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the assigned technicien (or an admin) can resolve",
            )
        # Column is TIMESTAMP WITHOUT TIME ZONE; asyncpg rejects aware datetimes.
        ticket.resolved_at = datetime.now(timezone.utc).replace(tzinfo=None)
    elif current == TicketStatut.EN_COURS and target == TicketStatut.ANNULE:
        if not is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    elif current == TicketStatut.RESOLU and target == TicketStatut.CLOTURE:
        if not is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    elif current == TicketStatut.RESOLU and target == TicketStatut.EN_COURS:
        # Reopen — the assigned tech can do this themselves when their own fix
        # didn't hold; anyone else needs admin.
        if not is_admin and ticket.assigned_to != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Seul le technicien assigné (ou un admin) peut rouvrir",
            )
    elif current in (TicketStatut.CLOTURE, TicketStatut.ANNULE):
        # Resurrecting a ticket the team considered finished is an admin call.
        if not is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    if current in REOPEN_FROM and target in (TicketStatut.EN_COURS, TicketStatut.NOUVEAU):
        # Stale resolution timestamp would otherwise survive the reopen and
        # make the ticket look resolved in every report that reads it.
        ticket.resolved_at = None

    ticket.statut = target
    _log_event(
        db,
        ticket.id,
        current_user.id,
        TicketActionKind.STATUT,
        f"Statut : {STATUT_LABEL[current]} → {STATUT_LABEL[target]}",
    )

    await db.flush()
    return await _reload_ticket(ticket.id, db)


@router.post("/{ticket_id}/actions", response_model=TicketActionRead,
             status_code=status.HTTP_201_CREATED)
async def add_action(
    ticket_id: uuid.UUID,
    payload: TicketActionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a comment to a ticket's timeline.

    Open to demandeurs on their own tickets: without it the person who
    reported the problem has no way to answer "did you try rebooting?" or to
    add the detail they forgot, and the tech's only recourse is to walk to the
    ward. Techs remain restricted to tickets they're assigned.
    """
    ticket = await _get_ticket_or_404(ticket_id, db)

    if current_user.role == Role.DEMANDEUR:
        if ticket.created_by != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    elif current_user.role == Role.INFORMATICIEN and ticket.assigned_to != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned technicien can add actions",
        )

    # A finished ticket's timeline is a record; reopen it to add to it.
    if ticket.statut in (TicketStatut.CLOTURE, TicketStatut.ANNULE):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ce ticket est clôturé ou annulé. Rouvrez-le pour ajouter un commentaire.",
        )

    action = TicketAction(
        ticket_id=ticket.id,
        description=payload.description,
        kind=TicketActionKind.COMMENTAIRE,
        created_by=current_user.id,
    )
    db.add(action)
    await db.flush()

    result = await db.execute(select(TicketAction).where(TicketAction.id == action.id))
    return result.scalar_one()


@router.patch("/{ticket_id}/archive", response_model=TicketRead)
async def archive_ticket(
    ticket_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    ticket = await _get_ticket_or_404(ticket_id, db)
    if ticket.archived_at is not None:
        return ticket
    if ticket.statut not in (TicketStatut.RESOLU, TicketStatut.CLOTURE, TicketStatut.ANNULE):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Seuls les tickets résolus, clôturés ou annulés peuvent être archivés",
        )
    ticket.archived_at = datetime.now(timezone.utc).replace(tzinfo=None)
    ticket.archived_by = current_user.id
    await db.flush()
    return await _reload_ticket(ticket.id, db)


@router.patch("/{ticket_id}/unarchive", response_model=TicketRead)
async def unarchive_ticket(
    ticket_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    ticket = await _get_ticket_or_404(ticket_id, db)
    if ticket.archived_at is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ce ticket n'est pas archivé",
        )
    ticket.archived_at = None
    ticket.archived_by = None
    await db.flush()
    return await _reload_ticket(ticket.id, db)
