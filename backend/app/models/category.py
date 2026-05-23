from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    household_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("households.id", ondelete="RESTRICT")
    )
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )

    __table_args__ = (
        UniqueConstraint("household_id", "name", name="categories_household_name_uniq"),
        Index("idx_categories_household", "household_id"),
    )
