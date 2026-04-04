from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.account import Account, AccountBalance
from app.schemas.net_worth import (
    AccountBalanceOut,
    AccountCreateRequest,
    AccountOut,
    AccountUpdateRequest,
    BalanceCreateRequest,
)

router = APIRouter(prefix="/api", tags=["net_worth"])


@router.get("/accounts")
async def get_accounts(
    userId: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Account).order_by(Account.type, Account.name)
    if userId:
        stmt = stmt.where(Account.user_id == userId)
    result = await db.execute(stmt)
    return [AccountOut.from_orm_model(a) for a in result.scalars().all()]


@router.post("/accounts")
async def create_account(
    body: AccountCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    if body.type not in ("asset", "liability"):
        return JSONResponse(
            status_code=400,
            content={"error": 'type must be "asset" or "liability"'},
        )
    account = Account(
        id=body.id,
        user_id=body.userId,
        name=body.name,
        type=body.type,
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return AccountOut.from_orm_model(account)


@router.put("/accounts/{account_id}")
async def update_account(
    account_id: str,
    body: AccountUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    if body.type not in ("asset", "liability"):
        return JSONResponse(
            status_code=400,
            content={"error": 'type must be "asset" or "liability"'},
        )
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        return JSONResponse(status_code=404, content={"error": "Account not found"})

    account.name = body.name
    account.type = body.type
    account.updated_at = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()
    await db.refresh(account)
    return AccountOut.from_orm_model(account)


@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        return JSONResponse(status_code=404, content={"error": "Account not found"})
    await db.execute(delete(Account).where(Account.id == account_id))
    await db.commit()
    return {"success": True}


@router.post("/accounts/{account_id}/balances")
async def add_balance(
    account_id: str,
    body: BalanceCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Account).where(Account.id == account_id))
    if not result.scalar_one_or_none():
        return JSONResponse(status_code=404, content={"error": "Account not found"})

    from datetime import date as date_type

    balance = AccountBalance(
        id=body.id,
        account_id=account_id,
        balance=body.balance,
        date=date_type.fromisoformat(body.date),
        note=body.note,
    )
    db.add(balance)
    await db.commit()
    await db.refresh(balance)
    return AccountBalanceOut.from_orm_model(balance)


@router.get("/accounts/{account_id}/balances")
async def get_balances(
    account_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AccountBalance)
        .where(AccountBalance.account_id == account_id)
        .order_by(
            AccountBalance.date.desc(),
            AccountBalance.created_at.desc(),
        )
    )
    return [AccountBalanceOut.from_orm_model(b) for b in result.scalars().all()]


@router.delete("/accounts/{account_id}/balances/{balance_id}")
async def delete_balance(
    account_id: str,
    balance_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AccountBalance).where(
            AccountBalance.id == balance_id,
            AccountBalance.account_id == account_id,
        )
    )
    balance = result.scalar_one_or_none()
    if not balance:
        return JSONResponse(
            status_code=404, content={"error": "Balance entry not found"}
        )
    await db.execute(
        delete(AccountBalance).where(
            AccountBalance.id == balance_id,
            AccountBalance.account_id == account_id,
        )
    )
    await db.commit()
    return {"success": True}
