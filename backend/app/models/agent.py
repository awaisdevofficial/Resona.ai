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
    llm_model = Column(String, default="llama-3.1-8b-instant")  # Groq; 8b uses less quota than 70b
    llm_temperature = Column(Float, default=0.8)  # Slight variety for less robotic tone
    llm_max_tokens = Column(Integer, default=150)  # Capped for real-time voice (Groq)
    stt_provider = Column(String, default="deepgram")
    stt_model = Column(String, default="nova-2")
    stt_language = Column(String, default="en")
    tts_provider = Column(String, default="cartesia")
    tts_voice_id = Column(String, nullable=True)
    tts_model = Column(String, nullable=True)  # Cartesia sonic-2 (worker uses sonic-2)
    tts_stability = Column(Float, default=0.45)  # Slightly lower = more expressive, less robotic
    silence_timeout = Column(Integer, default=30)
    max_duration = Column(Integer, default=3600)
    tools_config = Column(JSONB, default=dict)
    transfer_number = Column(String(20), nullable=True)  # E.164 for call transfer
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

