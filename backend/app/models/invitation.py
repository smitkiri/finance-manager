from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Invitation(Base):
    __tablename__ = "invitations"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    household_id: Mapped[str] = mapped_column(
        String(255),
        ForeignKey("households.id", ondelete="CASCADE"),
        nullable=False,
    )
    email: Mapped[str] = mapped_column(Text, nullable=False)
    token: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    invited_by_user_id: Mapped[str | None] = mapped_column(
        String(255),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp()
    )
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(nullable=True)

    __table_args__ = (
        Index("invitations_household_id_idx", "household_id"),
        # Note: the partial unique index
        # `invitations_active_one_per_email_per_household` is created in the
        # migration via op.execute. SQLAlchemy doesn't model PG partial indexes
        # portably via __table_args__; the runtime model doesn't need to know
        # about it.
    )
