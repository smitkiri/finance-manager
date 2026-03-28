from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Account(TimestampMixin, Base):
    __tablename__ = "accounts"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(20))
    teller_account_id: Mapped[str | None] = mapped_column(String(255))
    teller_enrollment_id: Mapped[str | None] = mapped_column(String(255))

    balances = relationship(
        "AccountBalance", back_populates="account", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("type IN ('asset', 'liability')", name="accounts_type_check"),
        Index("idx_accounts_user", "user_id"),
        Index("idx_accounts_teller_enrollment_id", "teller_enrollment_id"),
        Index("idx_accounts_teller_account_id", "teller_account_id"),
    )


class AccountBalance(Base):
    __tablename__ = "account_balances"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    account_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("accounts.id", ondelete="CASCADE")
    )
    balance: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    date: Mapped[date] = mapped_column(Date)  # ty: ignore[invalid-type-form]
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )

    account = relationship("Account", back_populates="balances")

    __table_args__ = (
        Index("idx_account_balances_account", "account_id"),
        Index("idx_account_balances_date", date.desc()),
    )
