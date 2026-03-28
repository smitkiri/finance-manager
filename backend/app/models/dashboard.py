from datetime import date
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Dashboard(TimestampMixin, Base):
    __tablename__ = "dashboards"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    is_default: Mapped[bool] = mapped_column(Boolean, server_default="false")
    date_range_start: Mapped[date] = mapped_column(Date)
    date_range_end: Mapped[date] = mapped_column(Date)

    panels = relationship(
        "DashboardPanel", back_populates="dashboard", cascade="all, delete-orphan"
    )


class DashboardPanel(TimestampMixin, Base):
    __tablename__ = "dashboard_panels"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    dashboard_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("dashboards.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(String(255))
    chart_type: Mapped[str] = mapped_column(String(10))
    # Legacy filter columns (frozen, not used by new code)
    filter_type: Mapped[str | None] = mapped_column(String(10))
    filter_categories: Mapped[Any | None] = mapped_column(JSONB, server_default="'[]'")
    filter_regex: Mapped[str | None] = mapped_column(Text)
    # Active filter columns
    filter_groups: Mapped[Any] = mapped_column(JSONB, server_default="'[]'")
    series_mode: Mapped[str | None] = mapped_column(
        String(20), server_default="'two_series'"
    )
    net_orientation: Mapped[str | None] = mapped_column(String(20))
    legend_options: Mapped[Any | None] = mapped_column(JSONB)
    panel_order: Mapped[int] = mapped_column(Integer, server_default="0")

    dashboard = relationship("Dashboard", back_populates="panels")

    __table_args__ = (
        CheckConstraint(
            "chart_type IN ('bar', 'line')", name="dashboard_panels_chart_type_check"
        ),
        Index("idx_dashboard_panels_dashboard", "dashboard_id"),
    )
