"""Demo accounts and a populated ticket history.

Gives a fresh database something to look at: two technicians, three ward
accounts, and a spread of tickets covering every status, priority and both
creation paths — plus timelines that mix typed comments with the server's own
audit entries.

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

# (local part, full name, role, service for demandeurs)
DEMO_USERS: list[tuple[str, str, Role, str | None]] = [
    ("karim", "Karim Benali", Role.INFORMATICIEN, None),
    ("salma", "Salma Idrissi", Role.INFORMATICIEN, None),
    ("nadia", "Nadia Cherkaoui", Role.DEMANDEUR, "Réanimation"),
    ("youssef", "Youssef Alami", Role.DEMANDEUR, "Urgences"),
    ("leila", "Leila Bennani", Role.DEMANDEUR, "Laboratoire"),
]


def ago(**kw) -> datetime:
    """Naive UTC — the timestamp columns are TIMESTAMP WITHOUT TIME ZONE."""
    return (datetime.now(timezone.utc) - timedelta(**kw)).replace(tzinfo=None)


# Each entry: the ticket, then its timeline. `by` is a local part; "sys" marks
# an entry the server would have written itself.
TICKETS: list[dict] = [
    dict(
        titre="Poste de soins ne démarre plus",
        description=(
            "Type de problème : Équipement en panne\n"
            "Le poste ne s'allume plus depuis la relève de nuit. Voyant "
            "d'alimentation éteint, aucun signal à l'écran."
        ),
        service="Réanimation", nature=TicketNature.TECHNIQUE,
        priorite=TicketPriorite.URGENT, statut=TicketStatut.EN_COURS,
        probleme=TicketProbleme.EQUIPEMENT_PANNE,
        created_by="nadia", assigned_to="karim", created=dict(hours=3),
        timeline=[
            ("sys", TicketActionKind.STATUT, "Statut : Nouveau → En cours", "karim", dict(hours=2, minutes=45)),
            ("msg", TicketActionKind.COMMENTAIRE,
             "Je passe en réanimation dans 10 minutes. Est-ce que le poste est "
             "branché sur l'onduleur ou directement sur la prise murale ?",
             "karim", dict(hours=2, minutes=40)),
            ("msg", TicketActionKind.COMMENTAIRE,
             "Sur l'onduleur. Les autres appareils branchés dessus fonctionnent "
             "normalement.", "nadia", dict(hours=2, minutes=31)),
        ],
    ),
    dict(
        titre="Pas de réseau sur deux postes",
        description="Type de problème : Pas de réseau / internet\nPlus d'accès au dossier patient depuis deux postes du service.",
        service="Urgences", nature=TicketNature.TECHNIQUE,
        priorite=TicketPriorite.URGENT, statut=TicketStatut.NOUVEAU,
        probleme=TicketProbleme.RESEAU_ABSENT,
        created_by="youssef", assigned_to=None, created=dict(minutes=25),
        timeline=[],
    ),
    dict(
        titre="Imprimante étiquettes hors service",
        description="L'imprimante d'étiquettes de la paillasse 2 n'imprime plus. Les prélèvements sont étiquetés à la main depuis ce matin.",
        service="Laboratoire", nature=TicketNature.MAINTENANCE,
        priorite=TicketPriorite.NORMAL, statut=TicketStatut.EN_COURS,
        created_by="leila", assigned_to="salma", created=dict(hours=6),
        timeline=[
            ("sys", TicketActionKind.ASSIGNATION, "Ticket assigné à Salma Idrissi", "salma", dict(hours=5, minutes=50)),
            ("sys", TicketActionKind.STATUT, "Statut : Nouveau → En cours", "salma", dict(hours=5, minutes=48)),
            ("msg", TicketActionKind.COMMENTAIRE,
             "Rouleau d'étiquettes remplacé, tête nettoyée. À surveiller sur la "
             "journée avant de clôturer.", "salma", dict(hours=4)),
        ],
    ),
    dict(
        titre="Application de dispensation très lente",
        description="Type de problème : Application bloquée ou lente\nLa recherche produit met plus de 30 secondes.",
        service="Pharmacie", nature=TicketNature.METIER,
        priorite=TicketPriorite.NORMAL, statut=TicketStatut.RESOLU,
        probleme=TicketProbleme.LOGICIEL_BLOQUE,
        created_by="leila", assigned_to="karim", created=dict(days=2),
        resolved=dict(days=1, hours=4),
        timeline=[
            ("sys", TicketActionKind.STATUT, "Statut : Nouveau → En cours", "karim", dict(days=1, hours=22)),
            ("msg", TicketActionKind.COMMENTAIRE,
             "Le poste tournait encore sur 4 Go de RAM. Barrette supplémentaire "
             "installée, profil utilisateur reconstruit.", "karim", dict(days=1, hours=5)),
            ("sys", TicketActionKind.STATUT, "Statut : En cours → Résolu", "karim", dict(days=1, hours=4)),
        ],
    ),
    dict(
        titre="Demande d'installation d'un poste supplémentaire",
        description="Type de problème : Demande d'installation ou d'accès\nUn poste supplémentaire est nécessaire au guichet 3.",
        service="Admissions", nature=TicketNature.ASSISTANCE,
        priorite=TicketPriorite.FAIBLE, statut=TicketStatut.NOUVEAU,
        probleme=TicketProbleme.INSTALLATION,
        created_by="youssef", assigned_to=None, created=dict(days=1, hours=2),
        timeline=[],
    ),
    dict(
        titre="Écran noir en salle 2",
        description="L'écran de la salle 2 est resté noir pendant une intervention. Rétabli après redémarrage, mais à fiabiliser.",
        service="Bloc opératoire", nature=TicketNature.TECHNIQUE,
        priorite=TicketPriorite.URGENT, statut=TicketStatut.CLOTURE,
        created_by="karim", assigned_to="karim", created=dict(days=6),
        resolved=dict(days=5),
        timeline=[
            ("sys", TicketActionKind.STATUT, "Statut : Nouveau → En cours", "karim", dict(days=5, hours=20)),
            ("msg", TicketActionKind.COMMENTAIRE,
             "Câble DisplayPort remplacé et fixé. Écran testé en continu pendant "
             "deux heures, aucune coupure.", "karim", dict(days=5, hours=2)),
            ("sys", TicketActionKind.STATUT, "Statut : En cours → Résolu", "karim", dict(days=5)),
            ("sys", TicketActionKind.STATUT, "Statut : Résolu → Clôturé", "admin", dict(days=4)),
        ],
    ),
    dict(
        titre="Scanner de documents ne répond plus",
        description="Le scanner de la console d'interprétation ne répond plus aux demandes de numérisation.",
        service="Imagerie médicale", nature=TicketNature.TECHNIQUE,
        priorite=TicketPriorite.NORMAL, statut=TicketStatut.EN_COURS,
        created_by="salma", assigned_to="salma", created=dict(days=1, hours=8),
        timeline=[
            ("sys", TicketActionKind.STATUT, "Statut : Nouveau → En cours", "salma", dict(days=1, hours=7)),
        ],
    ),
    dict(
        titre="Demande d'accès au dossier partagé",
        description="Type de problème : Demande d'installation ou d'accès\nAccès en lecture au dossier du service pour un nouvel agent.",
        service="Administration", nature=TicketNature.ASSISTANCE,
        priorite=TicketPriorite.FAIBLE, statut=TicketStatut.CLOTURE,
        probleme=TicketProbleme.INSTALLATION,
        created_by="nadia", assigned_to="salma", created=dict(days=9),
        resolved=dict(days=8),
        timeline=[
            ("sys", TicketActionKind.STATUT, "Statut : Nouveau → En cours", "salma", dict(days=8, hours=6)),
            ("msg", TicketActionKind.COMMENTAIRE, "Accès accordé et vérifié avec l'agent.", "salma", dict(days=8, hours=1)),
            ("sys", TicketActionKind.STATUT, "Statut : En cours → Résolu", "salma", dict(days=8)),
            ("sys", TicketActionKind.STATUT, "Statut : Résolu → Clôturé", "admin", dict(days=7)),
        ],
    ),
    dict(
        titre="Bourrage papier répété",
        description="Type de problème : Problème d'impression\nL'imprimante bourre plusieurs fois par jour.",
        service="Maternité", nature=TicketNature.MAINTENANCE,
        priorite=TicketPriorite.NORMAL, statut=TicketStatut.ANNULE,
        probleme=TicketProbleme.IMPRESSION,
        created_by="nadia", assigned_to=None, created=dict(days=4),
        timeline=[
            ("msg", TicketActionKind.COMMENTAIRE,
             "L'imprimante a été remplacée par le prestataire entre-temps, la "
             "demande n'a plus lieu d'être.", "nadia", dict(days=3, hours=4)),
            ("sys", TicketActionKind.STATUT, "Statut : Nouveau → Annulé", "admin", dict(days=3)),
        ],
    ),
    dict(
        titre="Session très lente à l'ouverture",
        description="Type de problème : Application bloquée ou lente\nPlusieurs minutes pour ouvrir une session le matin.",
        service="Cardiologie", nature=TicketNature.TECHNIQUE,
        priorite=TicketPriorite.NORMAL, statut=TicketStatut.NOUVEAU,
        probleme=TicketProbleme.LOGICIEL_BLOQUE,
        created_by="leila", assigned_to=None, created=dict(hours=20),
        timeline=[],
    ),
    dict(
        titre="Clavier hors service au guichet 1",
        description="Plusieurs touches ne répondent plus.",
        service="Admissions", nature=TicketNature.TECHNIQUE,
        priorite=TicketPriorite.FAIBLE, statut=TicketStatut.RESOLU,
        created_by="youssef", assigned_to="karim", created=dict(days=3),
        resolved=dict(days=2, hours=6),
        timeline=[
            ("sys", TicketActionKind.STATUT, "Statut : Nouveau → En cours", "karim", dict(days=2, hours=20)),
            ("msg", TicketActionKind.COMMENTAIRE, "Clavier remplacé depuis le stock.", "karim", dict(days=2, hours=7)),
            ("sys", TicketActionKind.STATUT, "Statut : En cours → Résolu", "karim", dict(days=2, hours=6)),
        ],
    ),
    dict(
        titre="Onduleur émet un bip continu",
        description="L'onduleur du service émet un signal sonore continu depuis hier soir.",
        service="Stérilisation", nature=TicketNature.MAINTENANCE,
        priorite=TicketPriorite.NORMAL, statut=TicketStatut.NOUVEAU,
        created_by="karim", assigned_to=None, created=dict(hours=14),
        timeline=[],
    ),
]


async def reset(db) -> None:
    users = (await db.execute(
        select(User).where(User.email.like(f"%{DEMO_DOMAIN}"))
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
    async with SessionLocal() as db:
        if "--reset" in sys.argv:
            await reset(db)

        services = {s.nom: s for s in (await db.execute(select(Service))).scalars().all()}
        if not services:
            print("No services found. Run seed.py first.")
            return

        # --- accounts -----------------------------------------------------
        users: dict[str, User] = {}
        for local, full_name, role, service_nom in DEMO_USERS:
            email = f"{local}{DEMO_DOMAIN}"
            found = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if found:
                users[local] = found
                continue

            poste_id = None
            if role == Role.DEMANDEUR and service_nom in services:
                poste = (await db.execute(
                    select(Poste).where(Poste.service_id == services[service_nom].id).limit(1)
                )).scalar_one_or_none()
                poste_id = poste.id if poste else None

            user = User(
                email=email, full_name=full_name,
                hashed_password=hash_password(DEMO_PASSWORD),
                role=role, poste_id=poste_id,
            )
            db.add(user)
            users[local] = user

        await db.flush()

        admin = (await db.execute(
            select(User).where(User.role == Role.ADMIN).limit(1)
        )).scalar_one_or_none()
        if admin:
            users.setdefault("admin", admin)

        # --- tickets ------------------------------------------------------
        existing = (await db.execute(
            select(Ticket.titre).where(Ticket.created_by.in_([u.id for u in users.values()]))
        )).scalars().all()
        if existing:
            print(f"Demo tickets already present ({len(existing)}) — skipping. Use --reset to redo.")
            await db.commit()
            return

        created = 0
        for spec in TICKETS:
            service = services.get(spec["service"])
            if service is None:
                continue

            poste = (await db.execute(
                select(Poste).where(Poste.service_id == service.id).limit(1)
            )).scalar_one_or_none()

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
            created += 1

            # Attach an asset from the workstation, so the equipment history
            # pages have something in them.
            if poste is not None:
                eq = (await db.execute(
                    select(Equipement).where(Equipement.poste_id == poste.id).limit(1)
                )).scalar_one_or_none()
                if eq is not None:
                    db.add(TicketEquipement(ticket_id=ticket.id, equipement_id=eq.id))

            for _kind, action_kind, text, author, when in spec["timeline"]:
                who = users.get(author)
                if who is None:
                    continue
                db.add(TicketAction(
                    ticket_id=ticket.id,
                    description=text,
                    kind=action_kind,
                    created_by=who.id,
                    created_at=ago(**when),
                ))

        await db.commit()

        print(f"Demo users: {len(DEMO_USERS)} (password: {DEMO_PASSWORD})")
        print(f"Demo tickets: {created}")


if __name__ == "__main__":
    asyncio.run(seed_demo())
