from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CallCreate(BaseModel):
    agent_id: UUID
    to_number: str
    metadata: dict[str, Any] = {}


class CallResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    agent_id: Optional[UUID]
    user_id: UUID
    direction: str
    status: str
    to_number: Optional[str]
    from_number: Optional[str]
    twilio_sid: Optional[str]
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    duration_seconds: Optional[int]
    transcript: list
    end_reason: Optional[str]
    cost_cents: int
    metadata: dict = Field(validation_alias="metadata_json")
    created_at: datetime


class TranscriptTurn(BaseModel):
    role: str  # "user" or "assistant"
    text: str
    timestamp: str


class CallCompleteRequest(BaseModel):
    duration_seconds: int
    end_reason: Optional[str] = None
    recording_url: Optional[str] = None

