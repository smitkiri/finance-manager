from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Index, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Budget(Base):
    """One version of a household's monthly limit for a category.

    The limit for a month is the latest version whose effective_month is on
    or before it; a NULL amount means the limit was removed from that month on.
    """

    __tablename__ = "budgets"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    household_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("households.id", ondelete="RESTRICT")
    )
    # Keyed by category name, like transactions.category. Intentionally does
    # not follow category renames, since transactions don't either.
    category: Mapped[str] = mapped_column(String(255))
    effective_month: Mapped[date] = mapped_column(Date)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )

    __table_args__ = (
        UniqueConstraint(
            "household_id",
            "category",
            "effective_month",
            name="budgets_household_category_month_uniq",
        ),
        Index("idx_budgets_household", "household_id"),
    )
