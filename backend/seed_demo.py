"""Demo accounts and a populated ticket history.

Gives a fresh database something to look at: two technicians, three ward
accounts, and a spread of tickets covering every status, priority and both
creation paths — plus timelines that mix typed comments with the server's own
audit entries.

The data respects the rules the API enforces, because seeding writes straight
to the database and would otherwise happily produce rows the application
itself could never create. In particular:

  * A demandeur's ticket takes its service and poste from the workstation
    their account is pinned to (see `create_ticket_as_demandeur`), so a ward
    account can only ever have tickets in its own service. `_validate()`
    below fails the seed if that ever stops being true.
  * `probleme_type` is only set on tickets opened through the demandeur form;
    it is NULL on everything a technician files.

All names, accounts and text are invented.

Run after seed.py and seed_inventaire.py:

    docker compose exec backend python seed_demo.py
    docker compose exec backend python seed_demo.py --reset   # wipe and redo
"""

import asyncio
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from app.core.security import hash_password
from app.db.session import SessionLocal
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

DEMO_DOMAIN = "@chu-valmont.fr"
DEMO_PASSWORD = "demo1234"

# (local part, full name, role, service — demandeurs only)
DEMO_USERS: list[tuple[str, str, Role, str | None]] = [
    ("karim", "Karim Benali", Role.INFORMATICIEN, None),
    ("salma", "Salma Idrissi", Role.INFORMATICIEN, None),
    ("nadia", "Nadia Cherkaoui", Role.DEMANDEUR, "Réanimation"),
    ("youssef", "Youssef Alami", Role.DEMANDEUR, "Urgences"),
    ("leila", "Leila Bennani", Role.DEMANDEUR, "Laboratoire"),
]

# Where each ward account sits. A demandeur ticket's service is looked up from
# here rather than written per-ticket, so the two cannot disagree.
DEMANDEUR_SERVICE = {
    local: service for local, _, role, service in DEMO_USERS
    if role == Role.DEMANDEUR
}


def ago(**kw) -> datetime:
    """Naive UTC — the timestamp columns are TIMESTAMP WITHOUT TIME ZONE."""
    return (datetime.now(timezone.utc) - timedelta(**kw)).replace(tzinfo=None)


# --- Tickets reported from the wards -------------------------------------
#
# No `service` key: it comes from the reporter's poste, exactly as the
# demandeur endpoint derives it. `probleme` is required here.
WARD_TICKETS: list[dict] = [
    dict(
        titre="Poste de soins ne démarre plus",
        description=(
            "Type de problème : Équipement en panne\n"
            "Le poste ne s'allume plus depuis la relève de nuit. Voyant "
            "d'alimentation éteint, aucun signal à l'écran."
        ),
        probleme=TicketProbleme.EQUIPEMENT_PANNE,
        nature=TicketNature.TECHNIQUE, priorite=TicketPriorite.URGENT,
        statut=TicketStatut.EN_COURS,
        created_by="nadia", assigned_to="karim", created=dict(hours=3),
        timeline=[
            (TicketActionKind.STATUT, "Statut : Nouveau → En cours", "karim", dict(hours=2, minutes=45)),
            (TicketActionKind.COMMENTAIRE,
             "Je passe en réanimation dans 10 minutes. Est-ce que le poste est "
             "branché sur l'onduleur ou directement sur la prise murale ?",
             "karim", dict(hours=2, minutes=40)),
            (TicketActionKind.COMMENTAIRE,
             "Sur l'onduleur. Les autres appareils branchés dessus fonctionnent "
             "normalement.", "nadia", dict(hours=2, minutes=31)),
        ],
    ),
    dict(
        titre="Pas de réseau sur deux postes",
        description="Type de problème : Pas de réseau / internet\nPlus d'accès au dossier patient depuis deux postes du service.",
        probleme=TicketProbleme.RESEAU_ABSENT,
        nature=TicketNature.TECHNIQUE, priorite=TicketPriorite.URGENT,
        statut=TicketStatut.NOUVEAU,
        created_by="youssef", assigned_to=None, created=dict(minutes=25),
        timeline=[],
    ),
    dict(
        titre="Imprimante étiquettes hors service",
        description="Type de problème : Problème d'impression\nL'imprimante d'étiquettes de la paillasse 2 n'imprime plus. Les prélèvements sont étiquetés à la main depuis ce matin.",
        probleme=TicketProbleme.IMPRESSION,
        nature=TicketNature.MAINTENANCE, priorite=TicketPriorite.NORMAL,
        statut=TicketStatut.EN_COURS,
        created_by="leila", assigned_to="salma", created=dict(hours=6),
        timeline=[
            (TicketActionKind.ASSIGNATION, "Ticket assigné à Salma Idrissi", "salma", dict(hours=5, minutes=50)),
            (TicketActionKind.STATUT, "Statut : Nouveau → En cours", "salma", dict(hours=5, minutes=48)),
            (TicketActionKind.COMMENTAIRE,
             "Rouleau d'étiquettes remplacé, tête nettoyée. À surveiller sur la "
             "journée avant de clôturer.", "salma", dict(hours=4)),
        ],
    ),
    dict(
        titre="Application de prescription très lente",
        description="Type de problème : Application bloquée ou lente\nLa recherche patient met plus de 30 secondes.",
        probleme=TicketProbleme.LOGICIEL_BLOQUE,
        nature=TicketNature.METIER, priorite=TicketPriorite.NORMAL,
        statut=TicketStatut.RESOLU,
        created_by="nadia", assigned_to="karim", created=dict(days=2),
        resolved=dict(days=1, hours=4),
        timeline=[
            (TicketActionKind.STATUT, "Statut : Nouveau → En cours", "karim", dict(days=1, hours=22)),
            (TicketActionKind.COMMENTAIRE,
             "Le poste tournait encore sur 4 Go de RAM. Barrette supplémentaire "
             "installée, profil utilisateur reconstruit.", "karim", dict(days=1, hours=5)),
            (TicketActionKind.STATUT, "Statut : En cours → Résolu", "karim", dict(days=1, hours=4)),
        ],
    ),
    dict(
        titre="Demande d'installation d'un poste supplémentaire",
        description="Type de problème : Demande d'installation ou d'accès\nUn poste supplémentaire est nécessaire au tri.",
        probleme=TicketProbleme.INSTALLATION,
        nature=TicketNature.ASSISTANCE, priorite=TicketPriorite.FAIBLE,
        statut=TicketStatut.NOUVEAU,
        created_by="youssef", assigned_to=None, created=dict(days=1, hours=2),
        timeline=[],
    ),
    dict(
        titre="Scanner de documents ne répond plus",
        description="Type de problème : Équipement en panne\nLe scanner de la paillasse ne répond plus aux demandes de numérisation.",
        probleme=TicketProbleme.EQUIPEMENT_PANNE,
        nature=TicketNature.TECHNIQUE, priorite=TicketPriorite.NORMAL,
        statut=TicketStatut.EN_COURS,
        created_by="leila", assigned_to="salma", created=dict(days=1, hours=8),
        timeline=[
            (TicketActionKind.STATUT, "Statut : Nouveau → En cours", "salma", dict(days=1, hours=7)),
        ],
    ),
    dict(
        titre="Onduleur émet un bip continu",
        description="Type de problème : Autre\nL'onduleur du poste de soins émet un signal sonore continu depuis hier soir.",
        probleme=TicketProbleme.AUTRE,
        nature=TicketNature.MAINTENANCE, priorite=TicketPriorite.NORMAL,
        statut=TicketStatut.NOUVEAU,
        created_by="nadia", assigned_to=None, created=dict(hours=14),
        timeline=[],
    ),
]

# --- Tickets filed by the IT unit ----------------------------------------
#
# Technicians use the full form, so they name any service and never carry a
# `probleme` — that field only exists on the simplified ward flow.
TECH_TICKETS: list[dict] = [
    dict(
        titre="Écran noir en salle 2",
        description="L'écran de la salle 2 est resté noir pendant une intervention. Rétabli après redémarrage, mais à fiabiliser.",
        service="Bloc opératoire",
        nature=TicketNature.TECHNIQUE, priorite=TicketPriorite.URGENT,
        statut=TicketStatut.CLOTURE,
        created_by="karim", assigned_to="karim", created=dict(days=6),
        resolved=dict(days=5),
        timeline=[
            (TicketActionKind.STATUT, "Statut : Nouveau → En cours", "karim", dict(days=5, hours=20)),
            (TicketActionKind.COMMENTAIRE,
             "Câble DisplayPort remplacé et fixé. Écran testé en continu pendant "
             "deux heures, aucune coupure.", "karim", dict(days=5, hours=2)),
            (TicketActionKind.STATUT, "Statut : En cours → Résolu", "karim", dict(days=5)),
            (TicketActionKind.STATUT, "Statut : Résolu → Clôturé", "admin", dict(days=4)),
        ],
    ),
    dict(
        titre="Création d'un accès au dossier partagé",
        description="Nouvel agent au service administratif : compte à créer et accès en lecture au dossier du service.",
        service="Administration",
        nature=TicketNature.ASSISTANCE, priorite=TicketPriorite.FAIBLE,
        statut=TicketStatut.CLOTURE,
        created_by="salma", assigned_to="salma", created=dict(days=9),
        resolved=dict(days=8),
        timeline=[
            (TicketActionKind.STATUT, "Statut : Nouveau → En cours", "salma", dict(days=8, hours=6)),
            (TicketActionKind.COMMENTAIRE, "Accès accordé et vérifié avec l'agent.", "salma", dict(days=8, hours=1)),
            (TicketActionKind.STATUT, "Statut : En cours → Résolu", "salma", dict(days=8)),
            (TicketActionKind.STATUT, "Statut : Résolu → Clôturé", "admin", dict(days=7)),
        ],
    ),
    dict(
        titre="Bourrage papier répété",
        description="Signalé par téléphone : l'imprimante bourre plusieurs fois par jour.",
        service="Maternité",
        nature=TicketNature.MAINTENANCE, priorite=TicketPriorite.NORMAL,
        statut=TicketStatut.ANNULE,
        created_by="karim", assigned_to=None, created=dict(days=4),
        timeline=[
            (TicketActionKind.COMMENTAIRE,
             "L'imprimante a été remplacée par le prestataire entre-temps, la "
             "demande n'a plus lieu d'être.", "karim", dict(days=3, hours=4)),
            (TicketActionKind.STATUT, "Statut : Nouveau → Annulé", "admin", dict(days=3)),
        ],
    ),
    dict(
        titre="Session très lente à l'ouverture",
        description="Plusieurs minutes pour ouvrir une session le matin sur les postes de consultation.",
        service="Cardiologie",
        nature=TicketNature.TECHNIQUE, priorite=TicketPriorite.NORMAL,
        statut=TicketStatut.NOUVEAU,
        created_by="salma", assigned_to=None, created=dict(hours=20),
        timeline=[],
    ),
    dict(
        titre="Clavier hors service au guichet 1",
        description="Plusieurs touches ne répondent plus. Remplacement depuis le stock.",
        service="Admissions",
        nature=TicketNature.TECHNIQUE, priorite=TicketPriorite.FAIBLE,
        statut=TicketStatut.RESOLU,
        created_by="karim", assigned_to="karim", created=dict(days=3),
        resolved=dict(days=2, hours=6),
        timeline=[
            (TicketActionKind.STATUT, "Statut : Nouveau → En cours", "karim", dict(days=2, hours=20)),
            (TicketActionKind.COMMENTAIRE, "Clavier remplacé depuis le stock.", "karim", dict(days=2, hours=7)),
            (TicketActionKind.STATUT, "Statut : En cours → Résolu", "karim", dict(days=2, hours=6)),
        ],
    ),
]


def _validate() -> None:
    """Fail loudly rather than seed rows the API could not have produced."""
    for spec in WARD_TICKETS:
        author = spec["created_by"]
        if author not in DEMANDEUR_SERVICE:
            raise SystemExit(f"ward ticket {spec['titre']!r} is authored by {author}, who is not a demandeur")
        if "service" in spec:
            raise SystemExit(f"ward ticket {spec['titre']!r} names a service; it must come from the reporter's poste")
        if not spec.get("probleme"):
            raise SystemExit(f"ward ticket {spec['titre']!r} has no probleme_type")

    for spec in TECH_TICKETS:
        if spec["created_by"] in DEMANDEUR_SERVICE:
            raise SystemExit(f"tech ticket {spec['titre']!r} is authored by a demandeur")
        if spec.get("probleme"):
            raise SystemExit(f"tech ticket {spec['titre']!r} sets probleme_type, which only the ward form does")
        if not spec.get("service"):
            raise SystemExit(f"tech ticket {spec['titre']!r} names no service")


async def reset(db) -> None:
    """Remove only the accounts this script creates.

    Matching on the domain would also catch the admin seeded by seed.py —
    it shares it — and quietly leave the database with no way in.
    """
    emails = [f"{local}{DEMO_DOMAIN}" for local, _, _, _ in DEMO_USERS]
    users = (await db.execute(
        select(User).where(User.email.in_(emails))
    )).scalars().all()
    ids = [u.id for u in users]
    if not ids:
        print("Nothing to reset.")
        return

    tickets = (await db.execute(
        select(Ticket.id).where(Ticket.created_by.in_(ids))
    )).scalars().all()

    if tickets:
        await db.execute(delete(TicketAction).where(TicketAction.ticket_id.in_(tickets)))
        await db.execute(delete(TicketEquipement).where(TicketEquipement.ticket_id.in_(tickets)))
        await db.execute(delete(Ticket).where(Ticket.id.in_(tickets)))
    await db.execute(delete(User).where(User.id.in_(ids)))
    await db.commit()
    print(f"Reset: removed {len(tickets)} tickets and {len(ids)} demo users.")


async def seed_demo() -> None:
    _validate()

    async with SessionLocal() as db:
        if "--reset" in sys.argv:
            await reset(db)

        services = {s.nom: s for s in (await db.execute(select(Service))).scalars().all()}
        if not services:
            print("No services found. Run seed.py first.")
            return

        # --- accounts -----------------------------------------------------
        users: dict[str, User] = {}
        postes: dict[str, Poste] = {}

        for local, full_name, role, service_nom in DEMO_USERS:
            email = f"{local}{DEMO_DOMAIN}"
            found = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()

            poste = None
            if role == Role.DEMANDEUR and service_nom in services:
                poste = (await db.execute(
                    select(Poste).where(Poste.service_id == services[service_nom].id).limit(1)
                )).scalar_one_or_none()
                if poste is None:
                    raise SystemExit(
                        f"no poste in {service_nom!r} to pin {local} to — run seed_inventaire.py first"
                    )
                postes[local] = poste

            if found:
                users[local] = found
                continue

            user = User(
                email=email, full_name=full_name,
                hashed_password=hash_password(DEMO_PASSWORD),
                role=role, poste_id=poste.id if poste else None,
            )
            db.add(user)
            users[local] = user

        await db.flush()

        admin = (await db.execute(
            select(User).where(User.role == Role.ADMIN).limit(1)
        )).scalar_one_or_none()
        if admin:
            users.setdefault("admin", admin)

        existing = (await db.execute(
            select(Ticket.id).where(Ticket.created_by.in_([u.id for u in users.values()]))
        )).scalars().all()
        if existing:
            print(f"Demo tickets already present ({len(existing)}) — skipping. Use --reset to redo.")
            await db.commit()
            return

        # --- tickets ------------------------------------------------------
        async def create(spec: dict, service: Service, poste: Poste | None) -> None:
            ticket = Ticket(
                titre=spec["titre"],
                description=spec["description"],
                nature=spec["nature"],
                priorite=spec["priorite"],
                statut=spec["statut"],
                probleme_type=spec.get("probleme"),
                service_id=service.id,
                poste_id=poste.id if poste else None,
                created_by=users[spec["created_by"]].id,
                assigned_to=users[spec["assigned_to"]].id if spec.get("assigned_to") else None,
                created_at=ago(**spec["created"]),
                updated_at=ago(**spec["created"]),
                resolved_at=ago(**spec["resolved"]) if spec.get("resolved") else None,
            )
            db.add(ticket)
            await db.flush()

            # Attach an asset from the workstation, so the equipment pages
            # have fault history on them.
            if poste is not None:
                eq = (await db.execute(
                    select(Equipement).where(Equipement.poste_id == poste.id).limit(1)
                )).scalar_one_or_none()
                if eq is not None:
                    db.add(TicketEquipement(ticket_id=ticket.id, equipement_id=eq.id))

            for kind, text, author, when in spec["timeline"]:
                who = users.get(author)
                if who is None:
                    continue
                db.add(TicketAction(
                    ticket_id=ticket.id, description=text, kind=kind,
                    created_by=who.id, created_at=ago(**when),
                ))

        created = 0

        for spec in WARD_TICKETS:
            author = spec["created_by"]
            poste = postes[author]
            service = services[DEMANDEUR_SERVICE[author]]
            await create(spec, service, poste)
            created += 1

        for spec in TECH_TICKETS:
            service = services.get(spec["service"])
            if service is None:
                continue
            poste = (await db.execute(
                select(Poste).where(Poste.service_id == service.id).limit(1)
            )).scalar_one_or_none()
            await create(spec, service, poste)
            created += 1

        await db.commit()

        print(f"Demo users: {len(DEMO_USERS)} (password: {DEMO_PASSWORD})")
        print(f"Demo tickets: {created} — {len(WARD_TICKETS)} reported from the wards, {len(TECH_TICKETS)} filed by the IT unit")


if __name__ == "__main__":
    asyncio.run(seed_demo())
