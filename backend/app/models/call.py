import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


class Call(Base):
    __tablename__ = "calls"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True, index=True
    )
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    phone_number_id = Column(
        UUID(as_uuid=True), ForeignKey("phone_numbers.id"), nullable=True
    )
    direction = Column(
        SAEnum("inbound", "outbound", name="direction_enum"), nullable=False
    )
    status = Column(
        SAEnum(
            "queued",
            "ringing",
            "in_progress",
            "completed",
            "failed",
            "no_answer",
            "busy",
            name="call_status_enum",
        ),
        default="queued",
    )
    to_number = Column(String, nullable=True)
    from_number = Column(String, nullable=True)
    twilio_sid = Column(String, unique=True, nullable=True, index=True)
    livekit_room = Column(String, nullable=True)
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    # [{role: "user"|"assistant", text: "...", timestamp: "ISO8601"}]
    transcript = Column(JSONB, default=list)
    summary = Column(Text, nullable=True)
    recording_url = Column(String, nullable=True)
    end_reason = Column(String, nullable=True)
    cost_cents = Column(Integer, default=0)
    analysis = Column(JSONB, nullable=True)
    # Use a non-reserved attribute name but keep the DB column name as "metadata"
    metadata_json = Column("metadata", JSONB, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

