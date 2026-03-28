from datetime import datetime
from typing import Any

from sqlalchemy import String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Metadata(Base):
    __tablename__ = "metadata"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    value: Mapped[Any] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
