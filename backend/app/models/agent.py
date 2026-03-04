import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


class Agent(Base):
    __tablename__ = "agents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    system_prompt = Column(Text, nullable=False)
    first_message = Column(String, nullable=True)
    llm_model = Column(String, default="gpt-4o-mini")
    llm_temperature = Column(Float, default=0.7)
    llm_max_tokens = Column(Integer, default=500)
    stt_provider = Column(String, default="deepgram")
    stt_model = Column(String, default="nova-2-general")
    stt_language = Column(String, default="en-US")
    tts_provider = Column(String, default="elevenlabs")
    tts_voice_id = Column(String, nullable=True)
    tts_stability = Column(Float, default=0.5)
    silence_timeout = Column(Integer, default=30)
    max_duration = Column(Integer, default=3600)
    tools_config = Column(JSONB, default=dict)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

