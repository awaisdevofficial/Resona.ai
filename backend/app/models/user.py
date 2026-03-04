import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum as SAEnum, Integer, String
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clerk_id = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False)
    name = Column(String)
    plan = Column(
        SAEnum("free", "starter", "pro", "enterprise", name="plan_enum"), default="free"
    )
    minutes_used = Column(Integer, default=0)
    minutes_limit = Column(Integer, default=100)
    stripe_customer_id = Column(String, unique=True, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Per-user Twilio configuration
    twilio_account_sid = Column(String, nullable=True)
    twilio_auth_token = Column(String, nullable=True)
    twilio_from_number = Column(String, nullable=True)

