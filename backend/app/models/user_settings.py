import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    # Twilio Basic
    twilio_account_sid = Column(String, nullable=True)
    twilio_auth_token = Column(String, nullable=True)
    twilio_from_number = Column(String, nullable=True)

    # Twilio SIP Trunking
    twilio_trunk_sid = Column(String, nullable=True)
    twilio_termination_uri = Column(String, nullable=True)
    twilio_sip_username = Column(String, nullable=True)
    twilio_sip_password = Column(String, nullable=True)

    # LiveKit SIP (auto-generated, stored for reference)
    livekit_inbound_trunk_id = Column(String, nullable=True)
    livekit_outbound_trunk_id = Column(String, nullable=True)
    livekit_dispatch_rule_id = Column(String, nullable=True)

    # SIP setup status
    sip_configured = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

