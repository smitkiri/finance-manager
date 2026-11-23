from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Label(Base):
    __tablename__ = "labels"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    household_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("households.id", ondelete="RESTRICT")
    )
    name: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
    created_by: Mapped[str] = mapped_column(String(10), server_default="user")

    __table_args__ = (
        UniqueConstraint("household_id", "name", name="labels_household_name_uniq"),
        CheckConstraint("created_by IN ('user', 'ai')", name="labels_created_by_check"),
        CheckConstraint("name <> ''", name="labels_name_nonempty_check"),
        CheckConstraint("char_length(name) <= 255", name="labels_name_length_check"),
        CheckConstraint(
            "name = btrim(name, chr(32)||chr(9)||chr(10)||chr(13)||chr(12)||chr(11))",
            name="labels_name_trimmed_check",
        ),
    )


class TransactionLabel(Base):
    __tablename__ = "transaction_labels"

    transaction_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("transactions.id", ondelete="CASCADE"), primary_key=True
    )
    label_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("labels.id", ondelete="CASCADE"), primary_key=True
    )

    __table_args__ = (Index("idx_transaction_labels_label", "label_id"),)
