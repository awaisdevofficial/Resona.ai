import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


class Webhook(Base):
    __tablename__ = "webhooks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    url = Column(String, nullable=False)
    events = Column(JSONB, default=list)
    secret = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    last_status = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

