import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


class VoiceProfile(Base):
    __tablename__ = "voice_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    # Underlying provider and its voice/profile identifier
    provider = Column(String, nullable=False)  # e.g. "cartesia", "chatterbox"
    provider_voice_id = Column(String, nullable=False)

    # Display information for the voice library
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    gender = Column(String, nullable=True)

    # Arbitrary provider-specific metadata (e.g. chatterbox profile path)
    metadata_json = Column(JSONB, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

