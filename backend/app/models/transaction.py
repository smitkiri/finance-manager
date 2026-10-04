from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    date: Mapped[date] = mapped_column(Date)  # ty: ignore[invalid-type-form]
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(255))
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    type: Mapped[str] = mapped_column(String(10))
    household_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("households.id", ondelete="RESTRICT")
    )
    created_by_user_id: Mapped[str | None] = mapped_column(
        String(255), ForeignKey("users.id", ondelete="SET NULL")
    )
    labels: Mapped[Any] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    metadata_: Mapped[Any] = mapped_column(
        "metadata", JSONB, server_default=text("'{}'::jsonb")
    )
    transfer_info: Mapped[Any | None] = mapped_column(JSONB)
    excluded_from_calculations: Mapped[bool] = mapped_column(
        Boolean, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
    import_id: Mapped[str | None] = mapped_column(
        String(255), ForeignKey("import_sessions.id", ondelete="SET NULL")
    )
    subscription_id: Mapped[str | None] = mapped_column(
        String(255), ForeignKey("subscriptions.id", ondelete="SET NULL")
    )
    # Transfer/refund group membership. No ondelete: groups are only removed by
    # `dissolve_group`, which clears these columns first (enforced by CHECKs).
    transfer_group_id: Mapped[str | None] = mapped_column(
        String(255),
        ForeignKey("transfer_groups.id", name="fk_transactions_transfer_group"),
    )
    transfer_role: Mapped[str | None] = mapped_column(String(10))
    # Counted amount after group allocation; NULL means "counts in full".
    effective_amount: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))

    import_session = relationship("ImportSession", back_populates="transactions")

    __table_args__ = (
        CheckConstraint(
            "type IN ('expense', 'income')", name="transactions_type_check"
        ),
        Index("idx_transactions_date", date.desc()),
        Index("idx_transactions_household", "household_id"),
        Index("idx_transactions_created_by", "created_by_user_id"),
        Index("idx_transactions_category", "category"),
        Index("idx_transactions_type", "type"),
        Index("idx_transactions_excluded", "excluded_from_calculations"),
        Index("idx_transactions_import_id", "import_id"),
        Index("idx_transactions_subscription_id", "subscription_id"),
        CheckConstraint(
            "transfer_role IN ('anchor', 'member')",
            name="transactions_transfer_role_check",
        ),
        CheckConstraint(
            "(transfer_group_id IS NULL) = (transfer_role IS NULL)",
            name="transactions_transfer_group_role_check",
        ),
        CheckConstraint(
            "transfer_group_id IS NOT NULL OR effective_amount IS NULL",
            name="transactions_effective_amount_check",
        ),
        Index("idx_transactions_transfer_group", "transfer_group_id"),
        Index(
            "uq_transactions_transfer_group_anchor",
            "transfer_group_id",
            unique=True,
            postgresql_where=text("transfer_role = 'anchor'"),
        ),
    )
