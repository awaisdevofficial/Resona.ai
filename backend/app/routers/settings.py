from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from twilio.rest import Client as TwilioClient

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User


router = APIRouter()


class TwilioCredentials(BaseModel):
    account_sid: str
    auth_token: str


class TwilioCredentialsResponse(BaseModel):
    account_sid: Optional[str]
    is_connected: bool
    from_number: Optional[str]


@router.get("/twilio", response_model=TwilioCredentialsResponse)
async def get_twilio_credentials(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),  # noqa: ARG001
):
    return {
        "account_sid": user.twilio_account_sid[:8] + "..." if user.twilio_account_sid else None,
        "is_connected": bool(user.twilio_account_sid),
        "from_number": user.twilio_from_number,
    }


@router.post("/twilio")
async def save_twilio_credentials(
    body: TwilioCredentials,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify credentials work before saving
    try:
        client = TwilioClient(body.account_sid, body.auth_token)
        # Test by fetching account info
        account = client.api.accounts(body.account_sid).fetch()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid Twilio credentials") from exc

    user.twilio_account_sid = body.account_sid
    user.twilio_auth_token = body.auth_token
    await db.commit()
    return {"status": "connected", "account_name": account.friendly_name}


@router.delete("/twilio")
async def disconnect_twilio(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.twilio_account_sid = None
    user.twilio_auth_token = None
    user.twilio_from_number = None
    await db.commit()
    return {"status": "disconnected"}

