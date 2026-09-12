"""Ticket lifecycle: numbering, visibility, state machine, timeline, paging."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.equipement import Equipement
from app.models.service import Service
from app.models.ticket import TicketStatut
from app.models.user import User

API = "/api/v1/tickets/"


async def make_ticket(client: AsyncClient, service: Service, **overrides) -> dict:
    payload = {
        "titre": "Écran noir",
        "description": "Le poste ne démarre plus",
        "nature": "technique",
        "service_id": str(service.id),
        **overrides,
    }
    res = await client.post(API, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


class TestNumbering:
    async def test_tickets_get_sequential_numbers(
        self, as_user, tech: User, service: Service
    ):
        client = as_user(tech)
        first = await make_ticket(client, service)
        second = await make_ticket(client, service)
        assert second["numero"] == first["numero"] + 1

    async def test_numero_is_present_and_positive(
        self, as_user, tech: User, service: Service
    ):
        ticket = await make_ticket(as_user(tech), service)
        assert ticket["numero"] >= 1


class TestCreationRules:
    async def test_demandeur_cannot_use_the_full_form(
        self, as_user, demandeur: User, service: Service
    ):
        """The full form would let them set their own priority, bypassing the
        server-side scoring that the whole demandeur flow depends on."""
        res = await as_user(demandeur).post(
            API,
            json={
                "titre": "x",
                "description": "y",
                "nature": "technique",
                "priorite": "urgent",
                "service_id": str(service.id),
            },
        )
        assert res.status_code == 403

    async def test_tech_cannot_preassign_to_someone_else(
        self, as_user, tech: User, other_tech: User, service: Service
    ):
        res = await as_user(tech).post(
            API,
            json={
                "titre": "x",
                "description": "y",
                "nature": "technique",
                "service_id": str(service.id),
                "assigned_to": str(other_tech.id),
            },
        )
        assert res.status_code == 403

    async def test_unknown_equipement_is_rejected(
        self, as_user, tech: User, service: Service
    ):
        res = await as_user(tech).post(
            API,
            json={
                "titre": "x",
                "description": "y",
                "nature": "technique",
                "service_id": str(service.id),
                "equipement_ids": ["00000000-0000-0000-0000-000000000001"],
            },
        )
        assert res.status_code == 404


class TestDemandeurFlow:
    async def test_priority_is_computed_not_client_supplied(
        self, as_user, demandeur: User, equipement: Equipement
    ):
        res = await as_user(demandeur).post(
            f"{API}demandeur",
            json={"probleme": "equipement_panne", "equipement_id": str(equipement.id)},
        )
        assert res.status_code == 201
        # crit 1 + panne 2 + PC 2 = 5 -> normal, not urgent
        assert res.json()["priorite"] == "normal"

    async def test_service_is_taken_from_the_account_not_the_request(
        self, as_user, demandeur: User, service: Service
    ):
        res = await as_user(demandeur).post(
            f"{API}demandeur", json={"probleme": "reseau_absent"}
        )
        assert res.status_code == 201
        assert res.json()["service_id"] == str(service.id)

    async def test_demandeur_only_sees_own_tickets(
        self, as_user, tech: User, demandeur: User, service: Service
    ):
        await make_ticket(as_user(tech), service)
        await as_user(demandeur).post(f"{API}demandeur", json={"probleme": "autre"})

        res = await as_user(demandeur).get(API)
        assert res.status_code == 200
        body = res.json()
        assert len(body) == 1
        assert body[0]["created_by_user"]["id"] == str(demandeur.id)

    async def test_demandeur_cannot_read_another_users_ticket(
        self, as_user, tech: User, demandeur: User, service: Service
    ):
        ticket = await make_ticket(as_user(tech), service)
        res = await as_user(demandeur).get(f"{API}{ticket['id']}")
        assert res.status_code == 403


class TestStateMachine:
    async def test_invalid_transition_is_rejected(
        self, as_user, tech: User, service: Service
    ):
        ticket = await make_ticket(as_user(tech), service)
        # nouveau -> resolu skips en_cours
        res = await as_user(tech).patch(
            f"{API}{ticket['id']}/status", json={"statut": "resolu"}
        )
        assert res.status_code == 422

    async def test_taking_a_ticket_self_assigns(
        self, as_user, tech: User, service: Service
    ):
        ticket = await make_ticket(as_user(tech), service)
        res = await as_user(tech).patch(
            f"{API}{ticket['id']}/status", json={"statut": "en_cours"}
        )
        assert res.status_code == 200
        assert res.json()["assigned_to_user"]["id"] == str(tech.id)

    async def test_tech_cannot_take_another_techs_ticket(
        self, as_user, tech: User, other_tech: User, service: Service
    ):
        ticket = await make_ticket(as_user(tech), service)
        await as_user(tech).patch(f"{API}{ticket['id']}/status", json={"statut": "en_cours"})

        res = await as_user(other_tech).patch(
            f"{API}{ticket['id']}/status", json={"statut": "resolu"}
        )
        assert res.status_code == 403

    async def test_resolving_sets_resolved_at(
        self, as_user, tech: User, service: Service
    ):
        ticket = await make_ticket(as_user(tech), service)
        client = as_user(tech)
        await client.patch(f"{API}{ticket['id']}/status", json={"statut": "en_cours"})
        res = await client.patch(f"{API}{ticket['id']}/status", json={"statut": "resolu"})
        assert res.json()["resolved_at"] is not None

    async def test_only_admin_can_close(
        self, as_user, tech: User, admin: User, service: Service
    ):
        ticket = await make_ticket(as_user(tech), service)
        client = as_user(tech)
        await client.patch(f"{API}{ticket['id']}/status", json={"statut": "en_cours"})
        await client.patch(f"{API}{ticket['id']}/status", json={"statut": "resolu"})

        assert (
            await as_user(tech).patch(
                f"{API}{ticket['id']}/status", json={"statut": "cloture"}
            )
        ).status_code == 403
        assert (
            await as_user(admin).patch(
                f"{API}{ticket['id']}/status", json={"statut": "cloture"}
            )
        ).status_code == 200


class TestReopen:
    async def test_assigned_tech_can_reopen_their_resolved_ticket(
        self, as_user, tech: User, service: Service
    ):
        ticket = await make_ticket(as_user(tech), service)
        client = as_user(tech)
        await client.patch(f"{API}{ticket['id']}/status", json={"statut": "en_cours"})
        await client.patch(f"{API}{ticket['id']}/status", json={"statut": "resolu"})

        res = await client.patch(
            f"{API}{ticket['id']}/status", json={"statut": "en_cours"}
        )
        assert res.status_code == 200
        assert res.json()["statut"] == "en_cours"

    async def test_reopening_clears_resolved_at(
        self, as_user, tech: User, service: Service
    ):
        """A stale resolved_at would make a reopened ticket look finished in
        every report that reads that column."""
        ticket = await make_ticket(as_user(tech), service)
        client = as_user(tech)
        await client.patch(f"{API}{ticket['id']}/status", json={"statut": "en_cours"})
        await client.patch(f"{API}{ticket['id']}/status", json={"statut": "resolu"})

        res = await client.patch(
            f"{API}{ticket['id']}/status", json={"statut": "en_cours"}
        )
        assert res.json()["resolved_at"] is None

    async def test_only_admin_can_reopen_a_closed_ticket(
        self, as_user, tech: User, admin: User, service: Service
    ):
        ticket = await make_ticket(as_user(tech), service)
        tc = as_user(tech)
        await tc.patch(f"{API}{ticket['id']}/status", json={"statut": "en_cours"})
        await tc.patch(f"{API}{ticket['id']}/status", json={"statut": "resolu"})
        await as_user(admin).patch(
            f"{API}{ticket['id']}/status", json={"statut": "cloture"}
        )

        assert (
            await as_user(tech).patch(
                f"{API}{ticket['id']}/status", json={"statut": "en_cours"}
            )
        ).status_code == 403
        assert (
            await as_user(admin).patch(
                f"{API}{ticket['id']}/status", json={"statut": "en_cours"}
            )
        ).status_code == 200


class TestTimeline:
    async def test_status_changes_are_logged(
        self, as_user, tech: User, service: Service
    ):
        """Previously invisible: who cancelled a ticket, and when, had no record."""
        ticket = await make_ticket(as_user(tech), service)
        client = as_user(tech)
        await client.patch(f"{API}{ticket['id']}/status", json={"statut": "en_cours"})

        res = await client.get(f"{API}{ticket['id']}")
        events = [a for a in res.json()["actions"] if a["kind"] == "statut"]
        assert len(events) == 1
        assert "Nouveau" in events[0]["description"]
        assert "En cours" in events[0]["description"]

    async def test_assignment_is_logged(
        self, as_user, admin: User, tech: User, service: Service
    ):
        ticket = await make_ticket(as_user(admin), service)
        client = as_user(admin)
        await client.patch(
            f"{API}{ticket['id']}/assign", json={"assigned_to": str(tech.id)}
        )

        res = await client.get(f"{API}{ticket['id']}")
        events = [a for a in res.json()["actions"] if a["kind"] == "assignation"]
        assert len(events) == 1
        assert tech.full_name in events[0]["description"]

    async def test_comments_are_distinguishable_from_system_events(
        self, as_user, tech: User, service: Service
    ):
        ticket = await make_ticket(as_user(tech), service)
        client = as_user(tech)
        await client.patch(f"{API}{ticket['id']}/status", json={"statut": "en_cours"})
        await client.post(
            f"{API}{ticket['id']}/actions", json={"description": "Câble remplacé"}
        )

        actions = (await client.get(f"{API}{ticket['id']}")).json()["actions"]
        kinds = {a["kind"] for a in actions}
        assert kinds == {"statut", "commentaire"}


class TestComments:
    async def test_demandeur_can_comment_on_own_ticket(
        self, as_user, demandeur: User
    ):
        created = await as_user(demandeur).post(
            f"{API}demandeur", json={"probleme": "autre"}
        )
        ticket_id = created.json()["id"]

        res = await as_user(demandeur).post(
            f"{API}{ticket_id}/actions",
            json={"description": "L'écran s'allume par intermittence"},
        )
        assert res.status_code == 201
        assert res.json()["kind"] == "commentaire"

    async def test_demandeur_cannot_comment_on_someone_elses_ticket(
        self, as_user, tech: User, demandeur: User, service: Service
    ):
        ticket = await make_ticket(as_user(tech), service)
        res = await as_user(demandeur).post(
            f"{API}{ticket['id']}/actions", json={"description": "coucou"}
        )
        assert res.status_code == 403

    async def test_unassigned_tech_cannot_comment(
        self, as_user, tech: User, other_tech: User, service: Service
    ):
        ticket = await make_ticket(as_user(tech), service)
        await as_user(tech).patch(
            f"{API}{ticket['id']}/status", json={"statut": "en_cours"}
        )
        res = await as_user(other_tech).post(
            f"{API}{ticket['id']}/actions", json={"description": "nope"}
        )
        assert res.status_code == 403

    async def test_cannot_comment_on_a_closed_ticket(
        self, as_user, tech: User, admin: User, service: Service
    ):
        ticket = await make_ticket(as_user(tech), service)
        tc = as_user(tech)
        await tc.patch(f"{API}{ticket['id']}/status", json={"statut": "en_cours"})
        await tc.patch(f"{API}{ticket['id']}/status", json={"statut": "resolu"})
        await as_user(admin).patch(
            f"{API}{ticket['id']}/status", json={"statut": "cloture"}
        )

        res = await as_user(admin).post(
            f"{API}{ticket['id']}/actions", json={"description": "trop tard"}
        )
        assert res.status_code == 422


class TestPagination:
    async def test_limit_caps_returned_rows_and_total_counts_all(
        self, as_user, tech: User, service: Service
    ):
        client = as_user(tech)
        for _ in range(5):
            await make_ticket(client, service)

        res = await client.get(API, params={"limit": 2})
        assert res.status_code == 200
        assert len(res.json()) == 2
        assert res.headers["X-Total-Count"] == "5"

    async def test_offset_walks_without_repeating_rows(
        self, as_user, tech: User, service: Service
    ):
        client = as_user(tech)
        for _ in range(5):
            await make_ticket(client, service)

        page1 = (await client.get(API, params={"limit": 2, "offset": 0})).json()
        page2 = (await client.get(API, params={"limit": 2, "offset": 2})).json()
        ids = {t["id"] for t in page1} | {t["id"] for t in page2}
        assert len(ids) == 4

    async def test_total_count_reflects_filters_not_whole_table(
        self, as_user, tech: User, service: Service
    ):
        client = as_user(tech)
        for _ in range(3):
            await make_ticket(client, service)
        taken = await make_ticket(client, service)
        await client.patch(f"{API}{taken['id']}/status", json={"statut": "en_cours"})

        res = await client.get(API, params={"statut": "en_cours"})
        assert res.headers["X-Total-Count"] == "1"

    @pytest.mark.parametrize("bad", [{"limit": 0}, {"limit": 501}, {"offset": -1}])
    async def test_out_of_range_paging_is_rejected(
        self, as_user, tech: User, bad: dict
    ):
        res = await as_user(tech).get(API, params=bad)
        assert res.status_code == 422
