from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )
