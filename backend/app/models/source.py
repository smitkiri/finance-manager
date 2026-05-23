from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, ForeignKey, Index, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    household_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("households.id", ondelete="RESTRICT")
    )
    mappings: Mapped[Any] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    flip_income_expense: Mapped[bool] = mapped_column(Boolean, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
    last_used: Mapped[datetime] = mapped_column(server_default=func.current_timestamp())

    __table_args__ = (
        UniqueConstraint("household_id", "name", name="sources_household_name_uniq"),
        Index("idx_sources_household", "household_id"),
    )
