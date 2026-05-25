import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_get_users_returns_household_members(client: AsyncClient):
    response = await client.get("/api/users")
    assert response.status_code == 200
    data = response.json()
    assert "users" in data
    # The conftest seeds a default user in the test household.
    assert len(data["users"]) >= 1
    emails = [u["email"] for u in data["users"]]
    assert "default@test.local" in emails


@pytest.mark.asyncio
async def test_patch_user_renames_member_of_household(
    client: AsyncClient, db_session: AsyncSession
):
    from app.models import User

    db_session.add(
        User(
            id="u-rename",
            name="Old Name",
            email="rename@test.local",
            password_hash="",
            # household_id auto-set to DEFAULT_TEST_HOUSEHOLD_ID by the
            # conftest before_insert listener.
        )
    )
    await db_session.commit()

    res = await client.patch("/api/users/u-rename", json={"name": "New Name"})
    assert res.status_code == 200
    assert res.json()["name"] == "New Name"


@pytest.mark.asyncio
async def test_patch_user_404_when_user_in_other_household(
    client: AsyncClient, db_session: AsyncSession
):
    from app.models import Household, User

    db_session.add(Household(id="hh-other", name="Other"))
    await db_session.flush()
    db_session.add(
        User(
            id="u-other",
            name="Other Person",
            email="other@test.local",
            password_hash="",
            household_id="hh-other",
        )
    )
    await db_session.commit()

    res = await client.patch("/api/users/u-other", json={"name": "Hacked"})
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_patch_user_404_when_user_missing(client: AsyncClient):
    res = await client.patch("/api/users/does-not-exist", json={"name": "X"})
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_patch_user_rejects_empty_name(client: AsyncClient):
    res = await client.patch("/api/users/anything", json={"name": ""})
    assert res.status_code == 422
