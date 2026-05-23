from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ImportSession(Base):
    __tablename__ = "import_sessions"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
    household_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("households.id", ondelete="RESTRICT")
    )
    created_by_user_id: Mapped[str | None] = mapped_column(
        String(255), ForeignKey("users.id", ondelete="SET NULL")
    )
    source_id: Mapped[str | None] = mapped_column(String(255))
    source_name: Mapped[str] = mapped_column(String(255))
    file_name: Mapped[str | None] = mapped_column(String(255))
    transaction_count: Mapped[int] = mapped_column(Integer, server_default="0")

    transactions = relationship("Transaction", back_populates="import_session")

    __table_args__ = (Index("idx_import_sessions_household", "household_id"),)
