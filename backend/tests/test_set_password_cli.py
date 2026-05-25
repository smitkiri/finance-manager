"""Tests for the operator CLI: python -m app.cli.set_password."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cli.set_password import run
from app.models import Household, User
from app.utils.passwords import verify_password


@pytest.mark.asyncio
async def test_sets_password_on_existing_user_by_id(db_session: AsyncSession):
    db_session.add(Household(id="hh", name="HH"))
    await db_session.flush()
    db_session.add(
        User(
            id="u-1",
            name="A",
            email="a@b.com",
            password_hash="",
            household_id="hh",
        )
    )
    await db_session.commit()

    await run(db_session, user="u-1", email=None, password="new-pass-12")

    result = await db_session.execute(select(User).where(User.id == "u-1"))
    user = result.scalar_one()
    assert verify_password("new-pass-12", user.password_hash)


@pytest.mark.asyncio
async def test_sets_password_and_email(db_session: AsyncSession):
    db_session.add(Household(id="hh", name="HH"))
    await db_session.flush()
    db_session.add(
        User(
            id="u-1",
            name="A",
            email="placeholder@x.local",
            password_hash="",
            household_id="hh",
        )
    )
    await db_session.commit()

    await run(
        db_session,
        user="u-1",
        email="real@example.com",
        password="new-pass-12",
    )

    result = await db_session.execute(select(User).where(User.id == "u-1"))
    user = result.scalar_one()
    assert user.email == "real@example.com"
    assert verify_password("new-pass-12", user.password_hash)


@pytest.mark.asyncio
async def test_looks_up_user_by_email(db_session: AsyncSession):
    db_session.add(Household(id="hh", name="HH"))
    await db_session.flush()
    db_session.add(
        User(
            id="u-1",
            name="A",
            email="lookup@example.com",
            password_hash="",
            household_id="hh",
        )
    )
    await db_session.commit()

    await run(
        db_session,
        user="lookup@example.com",
        email=None,
        password="new-pass-12",
    )

    result = await db_session.execute(select(User).where(User.id == "u-1"))
    user = result.scalar_one()
    assert verify_password("new-pass-12", user.password_hash)


@pytest.mark.asyncio
async def test_raises_when_user_not_found(db_session: AsyncSession):
    with pytest.raises(SystemExit):
        await run(db_session, user="does-not-exist", email=None, password="pw12345678")
