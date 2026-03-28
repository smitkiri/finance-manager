from datetime import datetime

from sqlalchemy import String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
