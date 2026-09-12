"""Inventory: filtering, identifier uniqueness, the audit log, and deletion.

The two rules worth pinning here are that an asset can only sit on a poste
belonging to its own service, and that archiving is reversible while the
`/permanent` delete is not.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.equipement import Equipement, EquipementEtat, EquipementType
from app.models.equipement_history import EquipementHistory
from app.models.poste import Poste
from app.models.service import Service
from app.models.user import User

API = "/api/v1/equipements/"


def payload(service: Service, **over) -> dict:
    body = {
        "reference": "EQ-NEW-1",
        "type": "pc",
        "marque": "Dell",
        "modele": "OptiPlex 5090",
        "service_id": str(service.id),
    }
    body.update(over)
    return body


async def make(client: AsyncClient, service: Service, **over) -> dict:
    res = await client.post(API, json=payload(service, **over))
    assert res.status_code == 201, res.text
    return res.json()


class TestAccess:
    async def test_demandeur_cannot_see_the_inventory(self, as_user, demandeur: User):
        """Ward staff get the ticket form, never the asset register."""
        assert (await as_user(demandeur).get(API)).status_code == 403

    async def test_demandeur_cannot_create(
        self, as_user, demandeur: User, service: Service
    ):
        res = await as_user(demandeur).post(API, json=payload(service))
        assert res.status_code == 403

    async def test_tech_can_list(self, as_user, tech: User):
        assert (await as_user(tech).get(API)).status_code == 200

    async def test_only_admin_can_archive(
        self, as_user, tech: User, admin: User, equipement: Equipement
    ):
        assert (await as_user(tech).delete(f"{API}{equipement.id}")).status_code == 403
        assert (await as_user(admin).delete(f"{API}{equipement.id}")).status_code == 200

    async def test_only_admin_can_hard_delete(
        self, as_user, tech: User, equipement: Equipement
    ):
        res = await as_user(tech).delete(f"{API}{equipement.id}/permanent")
        assert res.status_code == 403


class TestFiltering:
    async def test_filter_by_type(self, as_user, tech: User, service: Service):
        client = as_user(tech)
        await make(client, service, reference="EQ-PC", type="pc")
        await make(client, service, reference="EQ-SCR", type="ecran")

        res = await client.get(API, params={"type": "ecran"})
        assert [e["reference"] for e in res.json()] == ["EQ-SCR"]

    async def test_search_spans_identifiers_and_model(
        self, as_user, tech: User, service: Service
    ):
        client = as_user(tech)
        await make(client, service, reference="EQ-A", n_serie="SNABC123", marque="Lenovo")
        await make(client, service, reference="EQ-B", n_serie="SNXYZ789", marque="Dell")

        by_serial = await client.get(API, params={"q": "abc123"})
        assert [e["reference"] for e in by_serial.json()] == ["EQ-A"]

        by_marque = await client.get(API, params={"q": "lenovo"})
        assert [e["reference"] for e in by_marque.json()] == ["EQ-A"]

    async def test_retired_assets_are_hidden_by_default(
        self, as_user, tech: User, service: Service
    ):
        """A réformé asset stays in the database for its history, but must not
        clutter the day-to-day register."""
        client = as_user(tech)
        await make(client, service, reference="EQ-LIVE")
        await make(client, service, reference="EQ-DEAD", etat="reforme")

        default = await client.get(API)
        assert [e["reference"] for e in default.json()] == ["EQ-LIVE"]

        included = await client.get(API, params={"include_archived": "true"})
        assert {e["reference"] for e in included.json()} == {"EQ-LIVE", "EQ-DEAD"}

        only_retired = await client.get(API, params={"etat": "reforme"})
        assert [e["reference"] for e in only_retired.json()] == ["EQ-DEAD"]

    async def test_filter_by_salle_joins_through_the_poste(
        self, as_user, tech: User, service: Service, poste: Poste
    ):
        client = as_user(tech)
        await make(client, service, reference="EQ-ON", poste_id=str(poste.id))
        await make(client, service, reference="EQ-OFF")

        res = await client.get(API, params={"salle": "salle 1"})
        assert [e["reference"] for e in res.json()] == ["EQ-ON"]

    async def test_results_are_ordered_by_reference(
        self, as_user, tech: User, service: Service
    ):
        client = as_user(tech)
        for ref in ("EQ-C", "EQ-A", "EQ-B"):
            await make(client, service, reference=ref)

        refs = [e["reference"] for e in (await client.get(API)).json()]
        assert refs == sorted(refs)


class TestCreation:
    @pytest.mark.parametrize(
        "field,value",
        [("reference", "EQ-DUP"), ("n_serie", "SN-DUP"),
         ("code_barre", "CB-DUP"), ("inventaire", "INV-DUP")],
    )
    async def test_duplicate_identifier_is_rejected(
        self, as_user, tech: User, service: Service, field: str, value: str
    ):
        """Every identifier column is unique — a second asset claiming one is a
        409, not a 500 from the database constraint."""
        client = as_user(tech)
        # Build each body as one dict: for field="reference" this would
        # otherwise pass reference= twice and raise TypeError.
        first = {"reference": "EQ-FIRST", field: value}
        second = {"reference": "EQ-SECOND", field: value}

        await make(client, service, **first)
        res = await client.post(API, json=payload(service, **second))
        assert res.status_code == 409
        assert field in res.json()["detail"]

    async def test_poste_from_another_service_is_rejected(
        self, as_user, tech: User, service: Service, other_poste: Poste
    ):
        res = await as_user(tech).post(
            API, json=payload(service, poste_id=str(other_poste.id))
        )
        assert res.status_code == 422

    async def test_unknown_poste_is_404(self, as_user, tech: User, service: Service):
        res = await as_user(tech).post(
            API,
            json=payload(service, poste_id="00000000-0000-0000-0000-000000000001"),
        )
        assert res.status_code == 404

    async def test_service_level_asset_needs_no_poste(
        self, as_user, tech: User, service: Service
    ):
        """Switches and UPSs belong to a service, not a desk — which is why
        poste_id is nullable."""
        created = await make(as_user(tech), service, reference="EQ-SW", type="switch")
        assert created["poste_id"] is None


class TestAuditLog:
    async def test_changes_are_recorded_per_field(
        self, as_user, tech: User, db_read, equipement: Equipement
    ):
        res = await as_user(tech).patch(
            f"{API}{equipement.id}",
            json={"marque": "HP", "etat": "en_panne"},
        )
        assert res.status_code == 200

        async with db_read() as s:
            rows = (await s.execute(
                select(EquipementHistory).where(
                    EquipementHistory.equipement_id == equipement.id
                )
            )).scalars().all()

        by_field = {r.field: (r.old_value, r.new_value) for r in rows}
        assert by_field["marque"] == ("Generic", "HP")
        assert by_field["etat"] == ("operationnel", "en_panne")

    async def test_unchanged_fields_are_not_recorded(
        self, as_user, tech: User, db_read, equipement: Equipement
    ):
        """Sending a field back unchanged must not manufacture history."""
        await as_user(tech).patch(
            f"{API}{equipement.id}", json={"marque": equipement.marque}
        )
        async with db_read() as s:
            rows = (await s.execute(
                select(EquipementHistory).where(
                    EquipementHistory.equipement_id == equipement.id
                )
            )).scalars().all()
        assert rows == []

    async def test_history_endpoint_returns_the_entries(
        self, as_user, tech: User, equipement: Equipement
    ):
        client = as_user(tech)
        await client.patch(f"{API}{equipement.id}", json={"modele": "Model Y"})

        res = await client.get(f"{API}{equipement.id}/history")
        assert res.status_code == 200
        assert [r["field"] for r in res.json()] == ["modele"]

    async def test_moving_to_a_poste_of_another_service_is_rejected(
        self, as_user, tech: User, equipement: Equipement, other_poste: Poste
    ):
        res = await as_user(tech).patch(
            f"{API}{equipement.id}", json={"poste_id": str(other_poste.id)}
        )
        assert res.status_code == 422

    async def test_taking_another_assets_reference_is_rejected(
        self, as_user, tech: User, service: Service, equipement: Equipement
    ):
        client = as_user(tech)
        await make(client, service, reference="EQ-TAKEN")

        res = await client.patch(
            f"{API}{equipement.id}", json={"reference": "EQ-TAKEN"}
        )
        assert res.status_code == 409


class TestArchiveAndDelete:
    async def test_archive_retires_the_asset_and_logs_it(
        self, as_user, admin: User, db_read, equipement: Equipement
    ):
        res = await as_user(admin).delete(f"{API}{equipement.id}")
        assert res.status_code == 200
        assert res.json()["etat"] == "reforme"

        async with db_read() as s:
            rows = (await s.execute(
                select(EquipementHistory).where(
                    EquipementHistory.equipement_id == equipement.id
                )
            )).scalars().all()
        assert [r.new_value for r in rows] == ["reforme"]

    async def test_archiving_twice_logs_once(
        self, as_user, admin: User, db_read, equipement: Equipement
    ):
        client = as_user(admin)
        await client.delete(f"{API}{equipement.id}")
        await client.delete(f"{API}{equipement.id}")

        async with db_read() as s:
            rows = (await s.execute(
                select(EquipementHistory).where(
                    EquipementHistory.equipement_id == equipement.id
                )
            )).scalars().all()
        assert len(rows) == 1

    async def test_archive_is_reversible(
        self, as_user, admin: User, tech: User, equipement: Equipement
    ):
        await as_user(admin).delete(f"{API}{equipement.id}")
        res = await as_user(tech).patch(
            f"{API}{equipement.id}", json={"etat": "operationnel"}
        )
        assert res.json()["etat"] == "operationnel"

    async def test_permanent_delete_removes_the_row_and_its_history(
        self, as_user, admin: User, tech: User, db_read, equipement: Equipement
    ):
        await as_user(tech).patch(f"{API}{equipement.id}", json={"marque": "HP"})

        res = await as_user(admin).delete(f"{API}{equipement.id}/permanent")
        assert res.status_code == 204

        async with db_read() as s:
            assert (await s.execute(
                select(Equipement).where(Equipement.id == equipement.id)
            )).scalar_one_or_none() is None

            # ondelete=CASCADE on equipement_history.
            assert (await s.execute(
                select(EquipementHistory).where(
                    EquipementHistory.equipement_id == equipement.id
                )
            )).scalars().all() == []

    async def test_deleting_an_unknown_asset_is_404(self, as_user, admin: User):
        res = await as_user(admin).delete(
            f"{API}00000000-0000-0000-0000-000000000001/permanent"
        )
        assert res.status_code == 404


class TestExport:
    async def test_export_returns_a_spreadsheet(
        self, as_user, tech: User, service: Service
    ):
        client = as_user(tech)
        await make(client, service, reference="EQ-XL")

        res = await client.get(f"{API}export.xlsx")
        assert res.status_code == 200
        assert res.headers["content-type"].startswith(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        assert "attachment" in res.headers["content-disposition"]
        # PK.. — a .xlsx is a zip archive, so this catches an HTML error page
        # being served with the right content type.
        assert res.content[:2] == b"PK"

    async def test_export_is_staff_only(self, as_user, demandeur: User):
        assert (await as_user(demandeur).get(f"{API}export.xlsx")).status_code == 403
