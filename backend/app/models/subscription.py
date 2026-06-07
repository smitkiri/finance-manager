from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
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
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    household_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("households.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    cadence: Mapped[str] = mapped_column(String(16), nullable=False)
    expected_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    type: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    first_seen: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_seen: Mapped[date | None] = mapped_column(Date, nullable=True)
    detection_signature: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_overrides: Mapped[Any] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text(
            """'{"excludedTxnIds": [], "includedTxnIds": [], """
            """"lockName": false, "lockAmount": false, """
            """"lockCadence": false}'::jsonb"""
        ),
    )
    metadata_: Mapped[Any] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )

    __table_args__ = (
        CheckConstraint(
            "cadence IN ('weekly','biweekly','monthly','quarterly','annual')",
            name="subscriptions_cadence_check",
        ),
        CheckConstraint(
            "type IN ('expense','income')", name="subscriptions_type_check"
        ),
        CheckConstraint(
            "status IN ('active','possibly_cancelled','cancelled','manual')",
            name="subscriptions_status_check",
        ),
        Index("idx_subscriptions_household", "household_id"),
        Index("idx_subscriptions_household_status", "household_id", "status"),
    )
