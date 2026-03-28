from datetime import date, datetime

from sqlalchemy import Date, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DateRange(Base):
    __tablename__ = "date_ranges"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )

    __table_args__ = (UniqueConstraint("start_date", "end_date"),)
