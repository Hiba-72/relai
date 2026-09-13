"""Generate a synthetic hardware inventory: workstations and their equipment.

Everything here is fabricated. Serial numbers, asset tags and user names are
produced from a fixed random seed, so the same database comes out of every
run — useful for screenshots and for a demo you can reset.

Run after seed.py:

    docker compose exec backend python seed_inventaire.py
"""

import asyncio
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models.equipement import Equipement, EquipementEtat, EquipementType
from app.models.equipement_history import EquipementHistory
from app.models.poste import Poste
from app.models.service import Service
from app.models.user import Role, User

# Fixed seed: reproducible inventory, so a reset demo looks identical.
RNG = random.Random(20260912)

# Fictional staff. Names are invented; any resemblance is coincidental.
STAFF = [
    "Nadia Cherkaoui", "Youssef Alami", "Leila Bennani", "Omar Fassi",
    "Sanaa Berrada", "Hicham Douiri", "Imane Naciri", "Rachid Lamrani",
    "Khadija Sabri", "Mehdi Ouazzani", "Salma Haddad", "Tarik Belkacem",
    "Fatima Zahra Rami", "Anas Chraibi", "Asmae Bouzid", "Ilias Sefrioui",
    "Hafsa Kabbaj", "Zakaria Moutaoukil", "Ghita Lahlou", "Reda Amrani",
    "Soukaina Idrissi", "Bilal Tahiri", "Nawal Benjelloun", "Adil Mansouri",
]

# Rooms make sense per service, so the inventory reads like a real building.
SALLES = {
    "Urgences": ["Accueil", "Box 1", "Box 2", "Box 3", "Déchocage", "Tri"],
    "Réanimation": ["Poste de soins", "Chambre 1", "Chambre 2", "Chambre 3", "Bureau cadre"],
    "Bloc opératoire": ["Salle 1", "Salle 2", "Salle 3", "Réveil", "Secrétariat"],
    "Imagerie médicale": ["Console scanner", "Console IRM", "Radio 1", "Accueil", "Interprétation"],
    "Laboratoire": ["Paillasse 1", "Paillasse 2", "Réception", "Validation", "Bureau"],
    "Cardiologie": ["Consultation 1", "Consultation 2", "Échographie", "Secrétariat"],
    "Pédiatrie": ["Consultation 1", "Consultation 2", "Poste de soins", "Accueil"],
    "Maternité": ["Salle de naissance", "Poste de soins", "Consultation", "Accueil"],
    "Pharmacie": ["Dispensation", "Stock", "Préparation", "Bureau"],
    "Consultations externes": ["Box 1", "Box 2", "Box 3", "Box 4", "Accueil"],
    "Stérilisation": ["Zone lavage", "Zone conditionnement", "Bureau"],
    "Admissions": ["Guichet 1", "Guichet 2", "Guichet 3", "Bureau"],
    "Administration": ["Direction", "RH", "Finances", "Secrétariat"],
    "Service informatique": ["Bureau technique", "Salle serveur", "Atelier"],
}

PC_MODELS = [
    ("Dell", "OptiPlex 5090"), ("Dell", "OptiPlex 3080"),
    ("HP", "ProDesk 400 G7"), ("HP", "EliteDesk 800 G6"),
    ("Lenovo", "ThinkCentre M70q"), ("Lenovo", "ThinkCentre M75s"),
]
SCREEN_MODELS = [
    ("Dell", "P2422H", 24), ("Dell", "E2222H", 22),
    ("HP", "P22v G4", 22), ("HP", "V214a", 21),
    ("Lenovo", "ThinkVision T22i", 22), ("Lenovo", "L19e", 19),
]
PRINTER_MODELS = [
    ("HP", "LaserJet Pro M404dn"), ("Canon", "i-SENSYS LBP223dw"),
    ("Brother", "HL-L5100DN"), ("Kyocera", "ECOSYS P3145dn"),
]
SCANNER_MODELS = [("Canon", "DR-C225"), ("HP", "ScanJet Pro 2500")]
SWITCH_MODELS = [("Cisco", "CBS250-24T"), ("HP", "Aruba 1930-24G")]
UPS_MODELS = [("APC", "Back-UPS 1400"), ("Eaton", "5E 1500i")]

# A handful of assets are deliberately not "opérationnel" so the inventory
# filters and the equipment-state badges have something to show.
ETATS = (
    [EquipementEtat.OPERATIONNEL] * 22
    + [EquipementEtat.EN_PANNE] * 2
    + [EquipementEtat.EN_MAINTENANCE]
    + [EquipementEtat.REFORME]
)

# How many workstations each service gets.
POSTE_COUNT = {
    "Urgences": 8, "Réanimation": 7, "Bloc opératoire": 6,
    "Imagerie médicale": 6, "Laboratoire": 7, "Cardiologie": 5,
    "Pédiatrie": 5, "Maternité": 5, "Pharmacie": 5,
    "Consultations externes": 8, "Stérilisation": 3,
    "Admissions": 5, "Administration": 6, "Service informatique": 4,
}


def serial(prefix: str) -> str:
    body = "".join(RNG.choice("ABCDEFGHJKLMNPQRSTUVWXYZ0123456789") for _ in range(8))
    return f"{prefix}{body}"


class Tags:
    """Sequential asset tags, the way an inventory sheet numbers things."""

    def __init__(self) -> None:
        self._n = 0

    def next(self) -> str:
        self._n += 1
        return f"INV-{self._n:05d}"


def ago(days: float) -> datetime:
    """Naive UTC — the timestamp columns are TIMESTAMP WITHOUT TIME ZONE."""
    return (datetime.now(timezone.utc) - timedelta(days=days)).replace(tzinfo=None)


# Plausible edits an IT unit actually makes to a record: a machine goes in for
# repair and comes back, kit gets moved, a note is added. Without these the
# audit log on every asset is empty, which undersells the feature.
def history_for(eq: Equipement, admin_id, rng: random.Random) -> list[EquipementHistory]:
    def row(field, old, new, days):
        return EquipementHistory(
            equipement_id=eq.id, changed_by=admin_id,
            field=field, old_value=old, new_value=new, changed_at=ago(days),
        )

    rows: list[EquipementHistory] = []
    roll = rng.random()

    if eq.etat == EquipementEtat.EN_PANNE:
        rows.append(row("etat", "operationnel", "en_panne", rng.uniform(1, 20)))
    elif eq.etat == EquipementEtat.EN_MAINTENANCE:
        rows.append(row("etat", "operationnel", "en_maintenance", rng.uniform(1, 30)))
    elif eq.etat == EquipementEtat.REFORME:
        rows.append(row("etat", "operationnel", "en_panne", rng.uniform(60, 200)))
        rows.append(row("etat", "en_panne", "reforme", rng.uniform(20, 55)))
    elif roll < 0.30:
        # Went out for repair and came back — the most common pair.
        out = rng.uniform(40, 160)
        rows.append(row("etat", "operationnel", "en_maintenance", out))
        rows.append(row("etat", "en_maintenance", "operationnel", out - rng.uniform(3, 20)))

    if rng.random() < 0.12:
        rows.append(row("notes", None, rng.choice([
            "Nettoyage interne effectué.",
            "Ventilateur remplacé.",
            "Garantie expirée.",
            "Disque remplacé (SSD).",
        ]), rng.uniform(5, 90)))

    return rows


async def seed_inventory() -> None:
    async with SessionLocal() as db:
        existing = await db.scalar(select(func.count()).select_from(Poste))
        if existing:
            print(f"Postes already present ({existing}) — skipping.")
            return

        services = (await db.execute(select(Service))).scalars().all()
        if not services:
            print("No services found. Run seed.py first.")
            return

        tags = Tags()
        ref = 0
        n_postes = n_equipements = 0

        for service in services:
            salles = SALLES.get(service.nom, ["Bureau", "Accueil"])
            count = POSTE_COUNT.get(service.nom, 4)
            slug = "".join(w[0] for w in service.nom.split()[:3]).upper()

            for i in range(1, count + 1):
                poste = Poste(
                    nom=f"PC-{slug}-{i:02d}",
                    salle=salles[(i - 1) % len(salles)],
                    utilisateur=RNG.choice(STAFF),
                    service_id=service.id,
                )
                db.add(poste)
                await db.flush()
                n_postes += 1

                # Every workstation: a tower and a screen.
                marque, modele = RNG.choice(PC_MODELS)
                ref += 1
                db.add(Equipement(
                    reference=f"EQ-{ref:04d}",
                    n_serie=serial("SN"),
                    inventaire=tags.next(),
                    type=EquipementType.PC,
                    marque=marque, modele=modele,
                    service_id=service.id, poste_id=poste.id,
                    etat=RNG.choice(ETATS),
                    processeur=RNG.choice(["Intel i3-10100", "Intel i5-10500", "Intel i5-11400", "Intel i7-10700"]),
                    ram_go=RNG.choice([4, 8, 8, 16]),
                    disque_go=RNG.choice([256, 500, 500, 1000]),
                    systeme_exploitation=RNG.choice(["Windows 10 Pro", "Windows 10 Pro", "Windows 11 Pro"]),
                ))
                n_equipements += 1

                marque, modele, pouces = RNG.choice(SCREEN_MODELS)
                ref += 1
                db.add(Equipement(
                    reference=f"EQ-{ref:04d}",
                    n_serie=serial("SN"),
                    inventaire=tags.next(),
                    type=EquipementType.ECRAN,
                    marque=marque, modele=modele,
                    service_id=service.id, poste_id=poste.id,
                    etat=RNG.choice(ETATS),
                    ecran_pouces=pouces,
                ))
                n_equipements += 1

                # Roughly one workstation in three also has a printer.
                if RNG.random() < 0.35:
                    marque, modele = RNG.choice(PRINTER_MODELS)
                    ref += 1
                    db.add(Equipement(
                        reference=f"EQ-{ref:04d}",
                        n_serie=serial("PR"),
                        inventaire=tags.next(),
                        type=EquipementType.IMPRIMANTE,
                        marque=marque, modele=modele,
                        service_id=service.id, poste_id=poste.id,
                        etat=RNG.choice(ETATS),
                    ))
                    n_equipements += 1

                if RNG.random() < 0.12:
                    marque, modele = RNG.choice(SCANNER_MODELS)
                    ref += 1
                    db.add(Equipement(
                        reference=f"EQ-{ref:04d}",
                        n_serie=serial("SC"),
                        inventaire=tags.next(),
                        type=EquipementType.SCANNER,
                        marque=marque, modele=modele,
                        service_id=service.id, poste_id=poste.id,
                        etat=RNG.choice(ETATS),
                    ))
                    n_equipements += 1

            # Network kit belongs to the service, not to any one workstation —
            # which is why Equipement.poste_id is nullable.
            marque, modele = RNG.choice(SWITCH_MODELS)
            ref += 1
            db.add(Equipement(
                reference=f"EQ-{ref:04d}",
                n_serie=serial("SW"),
                inventaire=tags.next(),
                type=EquipementType.SWITCH,
                marque=marque, modele=modele,
                service_id=service.id,
                etat=EquipementEtat.OPERATIONNEL,
                notes="Baie de brassage du service",
            ))
            n_equipements += 1

            marque, modele = RNG.choice(UPS_MODELS)
            ref += 1
            db.add(Equipement(
                reference=f"EQ-{ref:04d}",
                n_serie=serial("UP"),
                inventaire=tags.next(),
                type=EquipementType.ONDULEUR,
                marque=marque, modele=modele,
                service_id=service.id,
                etat=RNG.choice(ETATS),
            ))
            n_equipements += 1

        # IDs only exist after a flush, so the audit rows are generated in a
        # second pass over what was just written.
        await db.flush()

        admin = (await db.execute(
            select(User).where(User.role == Role.ADMIN).limit(1)
        )).scalar_one_or_none()

        n_history = 0
        if admin is None:
            print("No admin found — skipping audit history. Run seed.py first.")
        else:
            equipements = (await db.execute(select(Equipement))).scalars().all()
            for eq in equipements:
                for row in history_for(eq, admin.id, RNG):
                    db.add(row)
                    n_history += 1

        await db.commit()
        print(f"Postes created: {n_postes}")
        print(f"Équipements created: {n_equipements}")
        print(f"Audit entries created: {n_history}")


if __name__ == "__main__":
    asyncio.run(seed_inventory())
