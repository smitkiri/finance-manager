from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.demo.limits import assert_demo_can_add_entity
from app.dependencies.auth import get_current_household_id
from app.models.account import Account, AccountBalance
from app.schemas.net_worth import (
    AccountBalanceOut,
    AccountCreateRequest,
    AccountOut,
    AccountUpdateRequest,
    BalanceCreateRequest,
    NetWorthHistoryPoint,
    NetWorthSummary,
)

router = APIRouter(prefix="/api", tags=["net_worth"])


async def _account_in_household(
    db: AsyncSession, account_id: str, household_id: str
) -> Account | None:
    result = await db.execute(
        select(Account).where(
            Account.id == account_id, Account.household_id == household_id
        )
    )
    return result.scalar_one_or_none()


@router.get("/accounts")
async def get_accounts(
    userId: str | None = Query(None),
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Account)
        .where(Account.household_id == household_id)
        .order_by(Account.type, Account.name)
    )
    if userId:
        stmt = stmt.where(Account.created_by_user_id == userId)
    result = await db.execute(stmt)
    return [AccountOut.from_orm_model(a) for a in result.scalars().all()]


@router.post("/accounts")
async def create_account(
    body: AccountCreateRequest,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    await assert_demo_can_add_entity(db, Account, household_id)
    if body.type not in ("asset", "liability"):
        return JSONResponse(
            status_code=400,
            content={"error": 'type must be "asset" or "liability"'},
        )
    account = Account(
        id=body.id,
        household_id=household_id,
        created_by_user_id=body.userId,
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
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    if body.type not in ("asset", "liability"):
        return JSONResponse(
            status_code=400,
            content={"error": 'type must be "asset" or "liability"'},
        )
    account = await _account_in_household(db, account_id, household_id)
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
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    account = await _account_in_household(db, account_id, household_id)
    if not account:
        return JSONResponse(status_code=404, content={"error": "Account not found"})
    await db.execute(delete(Account).where(Account.id == account_id))
    await db.commit()
    return {"success": True}


@router.post("/accounts/{account_id}/balances")
async def add_balance(
    account_id: str,
    body: BalanceCreateRequest,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    if not await _account_in_household(db, account_id, household_id):
        return JSONResponse(status_code=404, content={"error": "Account not found"})
    await assert_demo_can_add_entity(db, AccountBalance, household_id)

    balance = AccountBalance(
        id=body.id,
        account_id=account_id,
        balance=body.balance,
        date=date.fromisoformat(body.date),
        note=body.note,
    )
    db.add(balance)
    await db.commit()
    await db.refresh(balance)
    return AccountBalanceOut.from_orm_model(balance)


@router.get("/accounts/{account_id}/balances")
async def get_balances(
    account_id: str,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    if not await _account_in_household(db, account_id, household_id):
        return JSONResponse(status_code=404, content={"error": "Account not found"})
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
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    if not await _account_in_household(db, account_id, household_id):
        return JSONResponse(status_code=404, content={"error": "Account not found"})
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


@router.get("/net-worth/summary")
async def net_worth_summary(
    userId: str | None = Query(None),
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Account).where(Account.household_id == household_id)
    if userId:
        stmt = stmt.where(Account.created_by_user_id == userId)
    result = await db.execute(stmt)
    accounts = result.scalars().all()

    total_assets = 0.0
    total_liabilities = 0.0

    for account in accounts:
        bal_stmt = (
            select(AccountBalance.balance)
            .where(AccountBalance.account_id == account.id)
            .order_by(
                AccountBalance.date.desc(),
                AccountBalance.created_at.desc(),
            )
            .limit(1)
        )
        bal_result = await db.execute(bal_stmt)
        row = bal_result.scalar_one_or_none()
        bal = float(row) if row is not None else 0.0

        if account.type == "asset":
            total_assets += bal
        else:
            total_liabilities += bal

    return NetWorthSummary(
        totalAssets=total_assets,
        totalLiabilities=total_liabilities,
        netWorth=total_assets - total_liabilities,
    )


@router.get("/net-worth/history")
async def net_worth_history(
    userId: str | None = Query(None),
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    account_filter = "WHERE a.household_id = :household_id"
    params: dict[str, str] = {"household_id": household_id}
    if userId:
        account_filter += " AND a.created_by_user_id = :user_id"
        params["user_id"] = userId

    sql = text(f"""
        WITH relevant_accounts AS (
            SELECT a.id, a.type
            FROM accounts a
            {account_filter}
        ),
        all_dates AS (
            SELECT DISTINCT ab.date
            FROM account_balances ab
            JOIN relevant_accounts ra ON ra.id = ab.account_id
            ORDER BY ab.date
        ),
        account_date_balances AS (
            SELECT
                d.date,
                ra.id AS account_id,
                ra.type,
                (SELECT ab2.balance FROM account_balances ab2
                 WHERE ab2.account_id = ra.id AND ab2.date <= d.date
                 ORDER BY ab2.date DESC, ab2.created_at DESC LIMIT 1
                ) AS balance
            FROM all_dates d
            CROSS JOIN relevant_accounts ra
        )
        SELECT
            date,
            COALESCE(SUM(
                CASE WHEN type = 'asset' AND balance IS NOT NULL
                THEN balance ELSE 0 END
            ), 0) AS total_assets,
            COALESCE(SUM(
                CASE WHEN type = 'liability' AND balance IS NOT NULL
                THEN balance ELSE 0 END
            ), 0) AS total_liabilities
        FROM account_date_balances
        GROUP BY date
        ORDER BY date
    """)

    result = await db.execute(sql, params)
    rows = result.all()

    return [
        NetWorthHistoryPoint(
            date=str(row.date),
            totalAssets=float(row.total_assets),
            totalLiabilities=float(row.total_liabilities),
            netWorth=float(row.total_assets) - float(row.total_liabilities),
        )
        for row in rows
    ]
