from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


SUPPORTED_LANGUAGES = {
    "en-US",
    "en-GB",
    "es-ES",
    "es-US",
    "fr-FR",
    "de-DE",
}


# Limits to keep LiveKit token (and request URL) size safe
MAX_SYSTEM_PROMPT_LEN = 8000
MAX_FIRST_MESSAGE_LEN = 500


class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    system_prompt: str = Field(..., min_length=1, max_length=MAX_SYSTEM_PROMPT_LEN)
    first_message: str = Field(..., min_length=1, max_length=MAX_FIRST_MESSAGE_LEN)
    llm_model: str = "gpt-4o-mini"
    llm_temperature: float = Field(0.7, ge=0.0, le=1.0)
    llm_max_tokens: int = Field(500, ge=50, le=4000)
    stt_provider: str = "deepgram"
    stt_model: str = "nova-2-general"
    stt_language: str = "en-US"
    tts_provider: str = "cartesia"
    tts_voice_id: Optional[str] = None
    tts_stability: float = Field(0.5, ge=0.0, le=1.0)
    silence_timeout: int = Field(30, ge=5, le=300)
    max_duration: int = Field(3600, ge=60, le=14400)
    tools_config: dict[str, Any] = {}

    @field_validator("name")
    @classmethod
    def name_required(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Agent name is required")
        return v.strip()

    @field_validator("system_prompt")
    @classmethod
    def system_prompt_required(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("System prompt is required")
        return v

    @field_validator("first_message")
    @classmethod
    def first_message_required(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("First message is required")
        return v

    @field_validator("stt_language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        if not v:
            return "en-US"
        v = v.strip()
        if v not in SUPPORTED_LANGUAGES:
            raise ValueError(f"Unsupported language '{v}'. Supported: {', '.join(sorted(SUPPORTED_LANGUAGES))}")
        return v


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = Field(None, max_length=MAX_SYSTEM_PROMPT_LEN)
    first_message: Optional[str] = Field(None, max_length=MAX_FIRST_MESSAGE_LEN)
    llm_model: Optional[str] = None
    llm_temperature: Optional[float] = None
    llm_max_tokens: Optional[int] = None
    stt_provider: Optional[str] = None
    stt_model: Optional[str] = None
    stt_language: Optional[str] = None
    tts_provider: Optional[str] = None
    tts_voice_id: Optional[str] = None
    tts_stability: Optional[float] = None
    silence_timeout: Optional[int] = None
    max_duration: Optional[int] = None
    tools_config: Optional[dict] = None
    is_active: Optional[bool] = None


class AgentResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    description: Optional[str]
    system_prompt: str
    first_message: Optional[str]
    llm_model: str
    llm_temperature: float
    llm_max_tokens: int
    stt_provider: str
    stt_model: str
    stt_language: str
    tts_provider: str
    tts_voice_id: Optional[str]
    tts_stability: float
    silence_timeout: int
    max_duration: int
    tools_config: dict
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}

