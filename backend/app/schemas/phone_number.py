from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class PhoneNumberPurchase(BaseModel):
    twilio_number_sid: str
    friendly_name: Optional[str] = None


class PhoneNumberImport(BaseModel):
    number: str
    friendly_name: Optional[str] = None
    termination_uri: str


class PhoneNumberAssign(BaseModel):
    agent_id: Optional[UUID] = None  # None = unassign


class PhoneNumberResponse(BaseModel):
    id: UUID
    user_id: UUID
    agent_id: Optional[UUID]
    number: str
    friendly_name: Optional[str]
    origination_uri: Optional[str] = None
    termination_uri: Optional[str]
    capabilities: dict
    is_active: bool
    monthly_cost: Optional[int]
    purchased_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}

