from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DateRange(Base):
    __tablename__ = "date_ranges"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    household_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("households.id", ondelete="RESTRICT")
    )
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )

    __table_args__ = (
        UniqueConstraint(
            "household_id",
            "start_date",
            "end_date",
            name="date_ranges_household_dates_uniq",
        ),
        Index("idx_date_ranges_household", "household_id"),
    )
