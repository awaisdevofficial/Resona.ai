import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


class PhoneNumber(Base):
    __tablename__ = "phone_numbers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True)
    number = Column(String, unique=True, nullable=False)  # E.164
    twilio_sid = Column(String, unique=True, nullable=True)
    # Twilio origination URI (SIP URI used for outbound/origination)
    origination_uri = Column(String, nullable=True)
    # Optional termination URI where your carrier forwards calls
    termination_uri = Column(String, nullable=True)
    friendly_name = Column(String, nullable=True)
    capabilities = Column(JSONB, default=dict)  # {voice: true, sms: false}
    is_active = Column(Boolean, default=True)
    monthly_cost = Column(Integer, nullable=True)  # cents
    purchased_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

