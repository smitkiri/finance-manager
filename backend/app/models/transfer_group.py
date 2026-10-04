from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TransferGroup(Base):
    """One anchor transaction offset by N opposite-type member transactions.

    Membership and role live on `transactions` (`transfer_group_id`,
    `transfer_role`); the allocated counted amount lives in
    `transactions.effective_amount`. See `app/utils/transfer_groups.py`.
    """

    __tablename__ = "transfer_groups"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    household_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("households.id", ondelete="RESTRICT")
    )
    kind: Mapped[str] = mapped_column(String(10))
    source: Mapped[str] = mapped_column(String(10))
    include_in_calculations: Mapped[bool] = mapped_column(
        Boolean, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )

    __table_args__ = (
        CheckConstraint("kind IN ('self', 'user')", name="transfer_groups_kind_check"),
        CheckConstraint(
            "source IN ('manual', 'auto')", name="transfer_groups_source_check"
        ),
        Index("idx_transfer_groups_household", "household_id"),
    )
