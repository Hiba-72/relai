"""Seed the first admin account and the hospital's services.

The data here describes a fictional hospital (CHU Valmont). It is invented —
no real staff, assets, serial numbers or network ranges appear anywhere in
this repository.

Run once against a fresh database:

    docker compose exec backend python seed.py
"""

import asyncio

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.service import Etage, Service
from app.models.user import Role, User

ADMIN_EMAIL = "admin@chu-valmont.fr"
ADMIN_NAME = "Amine Tazi"
ADMIN_PASSWORD = "demo1234"

# (nom, sous_reseau, etage, niveau_criticite)
#
# `niveau_criticite` (0-3) is the first input to the priority score in
# app/services/priority.py: it is how a broken screen in Réanimation outranks
# the same screen in Administration without anyone ticking "urgent".
#   3 — care stops if IT stops
#   2 — care is degraded
#   1 — day-to-day clinical support
#   0 — non-clinical
SERVICES: list[tuple[str, str, Etage, int]] = [
    ("Urgences", "10.20.10.0/24", Etage.RDC, 3),
    ("Réanimation", "10.20.11.0/24", Etage.RDC, 3),
    ("Bloc opératoire", "10.20.12.0/24", Etage.ETAGE_1, 3),
    ("Imagerie médicale", "10.20.13.0/24", Etage.SOUS_SOL, 2),
    ("Laboratoire", "10.20.14.0/24", Etage.SOUS_SOL, 2),
    ("Cardiologie", "10.20.15.0/24", Etage.ETAGE_2, 2),
    ("Pédiatrie", "10.20.16.0/24", Etage.ETAGE_2, 2),
    ("Maternité", "10.20.17.0/24", Etage.ETAGE_1, 2),
    ("Pharmacie", "10.20.18.0/24", Etage.SOUS_SOL, 2),
    ("Consultations externes", "10.20.19.0/24", Etage.RDC, 1),
    ("Stérilisation", "10.20.20.0/24", Etage.SOUS_SOL, 1),
    ("Admissions", "10.20.21.0/24", Etage.RDC, 1),
    ("Administration", "10.20.22.0/24", Etage.ETAGE_2, 0),
    ("Service informatique", "10.20.1.0/24", Etage.SOUS_SOL, 1),
]


async def seed_admin(db) -> None:
    existing = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
    if existing.scalar_one_or_none():
        print(f"Admin already exists: {ADMIN_EMAIL} (skipping)")
        return

    db.add(
        User(
            email=ADMIN_EMAIL,
            full_name=ADMIN_NAME,
            hashed_password=hash_password(ADMIN_PASSWORD),
            role=Role.ADMIN,
        )
    )
    print(f"Admin created: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")


async def seed_services(db) -> None:
    result = await db.execute(select(Service.nom))
    existing = {row[0] for row in result.all()}

    inserted = 0
    for nom, sous_reseau, etage, criticite in SERVICES:
        if nom in existing:
            continue
        db.add(
            Service(
                nom=nom,
                sous_reseau=sous_reseau,
                etage=etage,
                niveau_criticite=criticite,
            )
        )
        inserted += 1

    print(f"Services inserted: {inserted} (skipped {len(SERVICES) - inserted})")


async def seed() -> None:
    async with SessionLocal() as db:
        await seed_admin(db)
        await seed_services(db)
        await db.commit()


if __name__ == "__main__":
    asyncio.run(seed())
