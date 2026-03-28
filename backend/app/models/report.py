from datetime import datetime
from typing import Any

from sqlalchemy import String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    filters: Mapped[Any] = mapped_column(JSONB, server_default="'{}'")
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
    last_modified: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
