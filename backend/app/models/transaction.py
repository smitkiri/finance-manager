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
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    date: Mapped[date] = mapped_column(Date)
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(255))
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    type: Mapped[str] = mapped_column(String(10))
    user_id: Mapped[str] = mapped_column(String(255))
    labels: Mapped[Any] = mapped_column(JSONB, server_default="'[]'")
    metadata_: Mapped[Any] = mapped_column("metadata", JSONB, server_default="'{}'")
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

    import_session = relationship("ImportSession", back_populates="transactions")

    __table_args__ = (
        CheckConstraint("type IN ('expense', 'income')", name="transactions_type_check"),
        Index("idx_transactions_date", date.desc()),
        Index("idx_transactions_user", "user_id"),
        Index("idx_transactions_category", "category"),
        Index("idx_transactions_type", "type"),
        Index("idx_transactions_excluded", "excluded_from_calculations"),
        Index("idx_transactions_import_id", "import_id"),
    )
