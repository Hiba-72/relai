"""Priority scoring for demandeur-created tickets.

The demandeur never picks a priority — the server computes one from three
signals so the same problem opened by an Urgences nurse and by an admin
secretary don't land at the same level.

Formula:

    score = service.niveau_criticite               # 0..3
          + PROBLEM_WEIGHTS[probleme_type]         # 0..2
          + max(EQUIPEMENT_WEIGHTS[eq.type] ...)   # 0..2, or 0 if no equipement

Thresholds:

    score >= 6  → urgent
    score  2-5  → normal
    score  0-1  → faible

Raising the urgent bar to 6 keeps "routine hardware problem in an unconfigured
service" (crit=1 default + panne=2 + écran/PC=2 = 5) at normal. Only services
the admin has *explicitly* bumped to criticité 2+ can push such a ticket to
urgent.

Weights are hardcoded on purpose: only `niveau_criticite` is exposed in the
admin UI. Tweak these if the split feels off after the demo.
"""
from collections.abc import Iterable

from app.models.equipement import Equipement, EquipementType
from app.models.ticket import TicketPriorite, TicketProbleme


PROBLEM_WEIGHTS: dict[TicketProbleme, int] = {
    TicketProbleme.EQUIPEMENT_PANNE: 2,
    TicketProbleme.RESEAU_ABSENT: 2,
    TicketProbleme.LOGICIEL_BLOQUE: 1,
    TicketProbleme.IMPRESSION: 1,
    TicketProbleme.INSTALLATION: 0,
    TicketProbleme.AUTRE: 1,
}

# Rough clinical impact if this asset type fails. Screens/PCs/network kit are
# the pieces that block a nurse from working at all; peripherals rank lower.
EQUIPEMENT_WEIGHTS: dict[EquipementType, int] = {
    EquipementType.ECRAN: 2,
    EquipementType.PC: 2,
    EquipementType.SWITCH: 2,
    EquipementType.ROUTEUR: 2,
    EquipementType.SERVEUR: 2,
    EquipementType.TELEPHONE: 2,
    EquipementType.SCANNER: 1,
    EquipementType.IMPRIMANTE: 1,
    EquipementType.ONDULEUR: 1,
    EquipementType.AUTRE: 0,
}


def compute_priority(
    niveau_criticite: int,
    probleme: TicketProbleme,
    equipements: Iterable[Equipement],
) -> TicketPriorite:
    """Return the priority level derived from the three weighted inputs."""
    eq_weights = [EQUIPEMENT_WEIGHTS.get(eq.type, 0) for eq in equipements]
    eq_score = max(eq_weights) if eq_weights else 0

    score = (
        max(0, min(3, niveau_criticite))
        + PROBLEM_WEIGHTS.get(probleme, 0)
        + eq_score
    )

    if score >= 6:
        return TicketPriorite.URGENT
    if score >= 2:
        return TicketPriorite.NORMAL
    return TicketPriorite.FAIBLE


# French labels used to synthesise a titre / description for the demandeur.
PROBLEM_LABEL: dict[TicketProbleme, str] = {
    TicketProbleme.EQUIPEMENT_PANNE: "Équipement en panne",
    TicketProbleme.RESEAU_ABSENT: "Pas de réseau / internet",
    TicketProbleme.LOGICIEL_BLOQUE: "Application bloquée ou lente",
    TicketProbleme.IMPRESSION: "Problème d'impression",
    TicketProbleme.INSTALLATION: "Demande d'installation ou d'accès",
    TicketProbleme.AUTRE: "Autre",
}
