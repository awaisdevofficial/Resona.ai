"""
Single-row table for service API keys (OpenAI, ElevenLabs).
Table name in DB: "api-keys" (quoted; if yours is api_keys, set __tablename__ = "api_keys").
"""

from sqlalchemy import BigInteger, Column, Text
from sqlalchemy import Identity

from app.database import Base


class ServiceApiKeys(Base):
    """API keys for OpenAI, ElevenLabs. Read first row."""
    __tablename__ = "api-keys"

    id = Column(BigInteger, Identity(always=True), primary_key=True)
    OPENAI_API_KEY = Column("OPENAI_API_KEY", Text, nullable=True, default="")
    ELEVENLABS_API_KEY = Column("ELEVENLABS_API_KEY", Text, nullable=True)
