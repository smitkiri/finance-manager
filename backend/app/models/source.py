from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    mappings: Mapped[Any] = mapped_column(JSONB, server_default="'[]'")
    flip_income_expense: Mapped[bool] = mapped_column(Boolean, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
    last_used: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
