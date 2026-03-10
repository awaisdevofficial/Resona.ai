"""System-wide key/value store for API keys (ElevenLabs, Groq, OpenAI, etc.). Loaded from DB; fallback to env."""

from sqlalchemy import Column, String, Text

from app.database import Base


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String(128), primary_key=True)
    value = Column(Text, nullable=True)
