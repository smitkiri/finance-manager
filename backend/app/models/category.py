from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Category(Base):
    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
