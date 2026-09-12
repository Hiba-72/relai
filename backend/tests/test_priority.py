"""Unit tests for the demandeur priority scoring.

These are the rules that decide how fast a nurse's ticket gets seen, so the
thresholds are pinned explicitly rather than asserted loosely.
"""

from types import SimpleNamespace

import pytest

from app.models.equipement import EquipementType
from app.models.ticket import TicketPriorite, TicketProbleme
from app.services.priority import compute_priority


def eq(type_: EquipementType) -> SimpleNamespace:
    """Minimal stand-in — compute_priority only reads ``.type``."""
    return SimpleNamespace(type=type_)


class TestThresholds:
    def test_max_signal_is_urgent(self):
        # crit 3 + panne 2 + PC 2 = 7
        assert (
            compute_priority(3, TicketProbleme.EQUIPEMENT_PANNE, [eq(EquipementType.PC)])
            == TicketPriorite.URGENT
        )

    def test_score_of_exactly_6_is_urgent(self):
        # crit 2 + panne 2 + PC 2 = 6, the documented urgent boundary
        assert (
            compute_priority(2, TicketProbleme.EQUIPEMENT_PANNE, [eq(EquipementType.PC)])
            == TicketPriorite.URGENT
        )

    def test_routine_breakage_in_default_service_stays_normal(self):
        """The case the urgent bar was raised to 6 specifically to exclude.

        Default criticality (1) + broken equipment (2) + a PC (2) = 5. If this
        ever returns urgent, every routine hardware fault floods the urgent
        queue and the priority signal becomes worthless.
        """
        assert (
            compute_priority(1, TicketProbleme.EQUIPEMENT_PANNE, [eq(EquipementType.PC)])
            == TicketPriorite.NORMAL
        )

    def test_low_signal_is_faible(self):
        # crit 0 + installation 0 + no equipement = 0
        assert (
            compute_priority(0, TicketProbleme.INSTALLATION, [])
            == TicketPriorite.FAIBLE
        )

    def test_score_of_exactly_2_is_normal(self):
        # crit 1 + logiciel 1 + none = 2, the faible/normal boundary
        assert (
            compute_priority(1, TicketProbleme.LOGICIEL_BLOQUE, [])
            == TicketPriorite.NORMAL
        )


class TestEquipementWeighting:
    def test_highest_weighted_equipement_wins(self):
        """Score uses max(), not sum() — five broken mice aren't an emergency."""
        assert compute_priority(
            1,
            TicketProbleme.EQUIPEMENT_PANNE,
            [eq(EquipementType.AUTRE), eq(EquipementType.PC)],
        ) == compute_priority(
            1, TicketProbleme.EQUIPEMENT_PANNE, [eq(EquipementType.PC)]
        )

    def test_no_equipement_contributes_zero(self):
        assert (
            compute_priority(3, TicketProbleme.AUTRE, []) == TicketPriorite.NORMAL
        )  # 3 + 1 + 0 = 4


class TestCriticalityClamping:
    @pytest.mark.parametrize("bad", [-5, 99])
    def test_out_of_range_criticality_is_clamped(self, bad: int):
        """A bad DB value must not be able to force or suppress urgency."""
        result = compute_priority(bad, TicketProbleme.INSTALLATION, [])
        assert result in {TicketPriorite.FAIBLE, TicketPriorite.NORMAL}

    def test_clamp_upper_bound_matches_criticality_3(self):
        assert compute_priority(
            99, TicketProbleme.EQUIPEMENT_PANNE, [eq(EquipementType.PC)]
        ) == compute_priority(
            3, TicketProbleme.EQUIPEMENT_PANNE, [eq(EquipementType.PC)]
        )
