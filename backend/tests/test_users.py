"""Account management: who may create accounts, and the password paths.

The rule with teeth here is that a demandeur must be pinned to a poste — the
whole simplified ticket flow derives the service from it — while the other
roles must not carry one.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import verify_password
from app.models.poste import Poste
from app.models.user import User

from .conftest import PASSWORD

API = "/api/v1/users/"


def new_user(**over) -> dict:
    body = {
        "email": "nouveau@relai-test.fr",
        "full_name": "Nouvel Agent",
        "password": "motdepasse123",
        "role": "informaticien",
    }
    body.update(over)
    return body


class TestAccess:
    async def test_demandeur_cannot_list_users(self, as_user, demandeur: User):
        assert (await as_user(demandeur).get(API)).status_code == 403

    async def test_tech_can_list_users(self, as_user, tech: User):
        """Technicians need the list to assign tickets."""
        assert (await as_user(tech).get(API)).status_code == 200

    async def test_tech_cannot_create_users(self, as_user, tech: User):
        assert (await as_user(tech).post(API, json=new_user())).status_code == 403

    async def test_admin_can_create_users(self, as_user, admin: User):
        res = await as_user(admin).post(API, json=new_user())
        assert res.status_code == 201
        assert res.json()["email"] == "nouveau@relai-test.fr"

    async def test_password_is_never_returned(self, as_user, admin: User):
        body = (await as_user(admin).post(API, json=new_user())).json()
        assert "password" not in body
        assert "hashed_password" not in body

    async def test_duplicate_email_is_409(self, as_user, admin: User, tech: User):
        res = await as_user(admin).post(API, json=new_user(email=tech.email))
        assert res.status_code == 409


class TestPosteRule:
    async def test_demandeur_without_a_poste_is_rejected(
        self, as_user, admin: User
    ):
        """Without a poste the simplified form has no service to derive, so the
        account would be unusable."""
        res = await as_user(admin).post(
            API, json=new_user(role="demandeur", email="sans-poste@relai-test.fr")
        )
        assert res.status_code == 422

    async def test_demandeur_with_a_poste_is_accepted(
        self, as_user, admin: User, poste: Poste
    ):
        res = await as_user(admin).post(
            API,
            json=new_user(
                role="demandeur",
                email="avec-poste@relai-test.fr",
                poste_id=str(poste.id),
            ),
        )
        assert res.status_code == 201
        assert res.json()["poste_id"] == str(poste.id)

    async def test_demandeur_with_an_unknown_poste_is_404(
        self, as_user, admin: User
    ):
        res = await as_user(admin).post(
            API,
            json=new_user(
                role="demandeur",
                email="faux-poste@relai-test.fr",
                poste_id="00000000-0000-0000-0000-000000000001",
            ),
        )
        assert res.status_code == 404

    async def test_poste_is_dropped_for_non_demandeur_roles(
        self, as_user, admin: User, poste: Poste
    ):
        """A technician is not tied to a desk; a stray poste_id is ignored
        rather than quietly stored."""
        res = await as_user(admin).post(
            API,
            json=new_user(
                role="informaticien",
                email="tech-poste@relai-test.fr",
                poste_id=str(poste.id),
            ),
        )
        assert res.status_code == 201
        assert res.json()["poste_id"] is None

    async def test_promoting_a_demandeur_clears_their_poste(
        self, as_user, admin: User, demandeur: User
    ):
        res = await as_user(admin).patch(
            f"{API}{demandeur.id}", json={"role": "informaticien"}
        )
        assert res.status_code == 200
        assert res.json()["poste_id"] is None

    async def test_demoting_to_demandeur_without_a_poste_is_rejected(
        self, as_user, admin: User, tech: User
    ):
        res = await as_user(admin).patch(
            f"{API}{tech.id}", json={"role": "demandeur"}
        )
        assert res.status_code == 422


class TestOwnPassword:
    async def test_change_requires_the_current_password(
        self, as_user, tech: User
    ):
        res = await as_user(tech).patch(
            f"{API}me/password",
            json={"current_password": "wrongpassword", "new_password": "nouveau12345"},
        )
        assert res.status_code == 403

    async def test_change_succeeds_and_actually_rehashes(
        self, as_user, db_read, tech: User
    ):
        res = await as_user(tech).patch(
            f"{API}me/password",
            json={"current_password": PASSWORD, "new_password": "nouveau12345"},
        )
        assert res.status_code == 204

        async with db_read() as s:
            stored = (await s.execute(
                select(User).where(User.id == tech.id)
            )).scalar_one().hashed_password

        assert verify_password("nouveau12345", stored)
        assert not verify_password(PASSWORD, stored)

    async def test_reusing_the_same_password_is_rejected(
        self, as_user, tech: User
    ):
        res = await as_user(tech).patch(
            f"{API}me/password",
            json={"current_password": PASSWORD, "new_password": PASSWORD},
        )
        assert res.status_code == 422

    async def test_a_demandeur_can_change_their_own_password(
        self, as_user, demandeur: User
    ):
        res = await as_user(demandeur).patch(
            f"{API}me/password",
            json={"current_password": PASSWORD, "new_password": "nouveau12345"},
        )
        assert res.status_code == 204


class TestAdminPasswordReset:
    async def test_admin_can_reset_without_the_old_password(
        self, as_user, db_read, admin: User, tech: User
    ):
        res = await as_user(admin).patch(
            f"{API}{tech.id}/password", json={"new_password": "resetpass123"}
        )
        assert res.status_code == 204

        async with db_read() as s:
            stored = (await s.execute(
                select(User).where(User.id == tech.id)
            )).scalar_one().hashed_password

        assert verify_password("resetpass123", stored)

    async def test_tech_cannot_reset_someone_elses_password(
        self, as_user, tech: User, other_tech: User
    ):
        res = await as_user(tech).patch(
            f"{API}{other_tech.id}/password", json={"new_password": "resetpass123"}
        )
        assert res.status_code == 403

    async def test_resetting_an_unknown_user_is_404(self, as_user, admin: User):
        res = await as_user(admin).patch(
            f"{API}00000000-0000-0000-0000-000000000001/password",
            json={"new_password": "resetpass123"},
        )
        assert res.status_code == 404

    @pytest.mark.parametrize("short", ["", "abc", "1234567"])
    async def test_short_passwords_are_rejected(
        self, as_user, admin: User, tech: User, short: str
    ):
        """Length is enforced where a password is SET — unlike the login
        endpoint, where it would leak the policy."""
        res = await as_user(admin).patch(
            f"{API}{tech.id}/password", json={"new_password": short}
        )
        assert res.status_code == 422


class TestDeactivation:
    async def test_admin_can_deactivate_an_account(
        self, as_user, admin: User, tech: User
    ):
        res = await as_user(admin).patch(
            f"{API}{tech.id}", json={"is_active": False}
        )
        assert res.status_code == 200
        assert res.json()["is_active"] is False

    async def test_email_cannot_collide_on_update(
        self, as_user, admin: User, tech: User, other_tech: User
    ):
        res = await as_user(admin).patch(
            f"{API}{tech.id}", json={"email": other_tech.email}
        )
        assert res.status_code == 409

    async def test_updating_an_unknown_user_is_404(self, as_user, admin: User):
        res = await as_user(admin).patch(
            f"{API}00000000-0000-0000-0000-000000000001",
            json={"full_name": "Personne"},
        )
        assert res.status_code == 404
