from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WebhookCreate(BaseModel):
    url: str
    events: List[str] = Field(default_factory=list)
    secret: Optional[str] = None


class WebhookUpdate(BaseModel):
    url: Optional[str] = None
    events: Optional[List[str]] = None
    secret: Optional[str] = None
    is_active: Optional[bool] = None


class WebhookResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    url: str
    events: list
    is_active: bool
    last_status: Optional[int] = None
    created_at: datetime
