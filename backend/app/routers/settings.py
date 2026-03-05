from typing import Optional

import aiohttp
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from twilio.rest import Client as TwilioClient

import uuid

from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.phone_number import PhoneNumber
from app.models.user import User
from app.models.user_settings import UserSettings
from app.services.sip_service import delete_user_sip, setup_user_sip


router = APIRouter()


class TwilioCredentials(BaseModel):
    account_sid: str
    auth_token: str


class TwilioCredentialsResponse(BaseModel):
    account_sid: Optional[str]
    is_connected: bool
    from_number: Optional[str]


class TTSProviderStatus(BaseModel):
    id: str
    label: str
    configured: bool
    recommended: bool = False
    cost_display: Optional[str] = None


class TTSSettingsResponse(BaseModel):
    default_provider: str
    providers: list[TTSProviderStatus]


class SIPConfigRequest(BaseModel):
    account_sid: str
    auth_token: str
    phone_number: str
    trunk_sid: str
    termination_uri: str
    sip_username: str
    sip_password: str


class SIPStatusResponse(BaseModel):
    configured: bool
    inbound_trunk_id: Optional[str] = None
    outbound_trunk_id: Optional[str] = None
    dispatch_rule_id: Optional[str] = None
    phone_number: Optional[str] = None
    livekit_sip_uri: Optional[str] = None
    origination_uri: Optional[str] = None


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


@router.get("/tts", response_model=TTSSettingsResponse)
async def get_tts_settings(
    user: User = Depends(get_current_user),  # noqa: ARG001
):
    """
    Return available TTS providers for display in the Settings UI.

    This is deployment-wide configuration (from environment variables),
    not per-user API keys.
    """
    cartesia_configured = bool(settings.CARTESIA_API_KEY)
    default_provider = "cartesia" if cartesia_configured else "cartesia"

    providers = [
        TTSProviderStatus(
            id="cartesia",
            label="Cartesia",
            configured=cartesia_configured,
            recommended=True,
            cost_display="~$0.008 / min (STT + TTS)",
        ),
    ]

    return TTSSettingsResponse(default_provider=default_provider, providers=providers)


@router.post("/sip/configure", response_model=SIPStatusResponse)
async def configure_sip(
    body: SIPConfigRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate Twilio credentials
    try:
        twilio_client = TwilioClient(body.account_sid, body.auth_token)
        _ = twilio_client.api.accounts(body.account_sid).fetch()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid Twilio credentials") from exc

    # Get or create user settings
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )
    user_settings = result.scalar_one_or_none()
    if not user_settings:
        user_settings = UserSettings(user_id=user.id)
        db.add(user_settings)

    # Delete existing LiveKit SIP resources if any
    if user_settings.livekit_inbound_trunk_id:
        try:
            await delete_user_sip(
                user_settings.livekit_inbound_trunk_id,
                user_settings.livekit_outbound_trunk_id,
                user_settings.livekit_dispatch_rule_id,
            )
        except Exception:
            # Best-effort cleanup; continue even if deletion fails
            pass

    # Register in LiveKit
    try:
        sip_ids = await setup_user_sip(
            user_id=str(user.id),
            phone_number=body.phone_number,
            termination_uri=body.termination_uri,
            sip_username=body.sip_username,
            sip_password=body.sip_password,
        )
    except aiohttp.ContentTypeError as e:
        raise HTTPException(
            status_code=502,
            detail="LiveKit SIP API returned a non-JSON response (e.g. 404). Check that LIVEKIT_URL is correct and your LiveKit server has the SIP/twirp API exposed.",
        ) from e
    except aiohttp.ClientResponseError as e:
        raise HTTPException(
            status_code=502,
            detail=f"LiveKit SIP API error ({e.status}): {e.message}. Ensure LIVEKIT_URL points to a LiveKit server with SIP enabled.",
        ) from e
    except aiohttp.ClientError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Cannot reach LiveKit server: {e!s}. Check LIVEKIT_URL and network.",
        ) from e

    # Save to DB
    user_settings.twilio_account_sid = body.account_sid
    user_settings.twilio_auth_token = body.auth_token
    user_settings.twilio_from_number = body.phone_number
    user_settings.twilio_trunk_sid = body.trunk_sid
    user_settings.twilio_termination_uri = body.termination_uri
    user_settings.twilio_sip_username = body.sip_username
    user_settings.twilio_sip_password = body.sip_password
    user_settings.livekit_inbound_trunk_id = sip_ids["inbound_trunk_id"]
    user_settings.livekit_outbound_trunk_id = sip_ids["outbound_trunk_id"]
    user_settings.livekit_dispatch_rule_id = sip_ids["dispatch_rule_id"]
    user_settings.sip_configured = True

    # Add the configured phone number to Phone Numbers so it appears without separate import
    existing = await db.execute(
        select(PhoneNumber).where(PhoneNumber.number == body.phone_number.strip())
    )
    existing_record = existing.scalar_one_or_none()
    if existing_record is None:
        phone_record = PhoneNumber(
            id=uuid.uuid4(),
            user_id=user.id,
            number=body.phone_number.strip(),
            twilio_sid=None,
            friendly_name=body.phone_number.strip(),
            is_active=True,
        )
        db.add(phone_record)
    elif existing_record.user_id != user.id:
        # Number already registered to another user; skip adding
        pass
    # else: same user already has this number, no-op

    await db.commit()

    livekit_sip_uri = f"sip:{settings.LIVEKIT_API_KEY}@{settings.PUBLIC_HOST}"
    origination_uri = f"{livekit_sip_uri}:5060"

    return SIPStatusResponse(
        configured=True,
        inbound_trunk_id=sip_ids["inbound_trunk_id"],
        outbound_trunk_id=sip_ids["outbound_trunk_id"],
        dispatch_rule_id=sip_ids["dispatch_rule_id"],
        phone_number=body.phone_number,
        livekit_sip_uri=livekit_sip_uri,
        origination_uri=origination_uri,
    )


@router.get("/sip/status", response_model=SIPStatusResponse)
async def get_sip_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )
    user_settings = result.scalar_one_or_none()
    if not user_settings or not user_settings.sip_configured:
        return SIPStatusResponse(configured=False)

    livekit_sip_uri = f"sip:{settings.LIVEKIT_API_KEY}@{settings.PUBLIC_HOST}"
    origination_uri = f"{livekit_sip_uri}:5060"

    return SIPStatusResponse(
        configured=True,
        inbound_trunk_id=user_settings.livekit_inbound_trunk_id,
        outbound_trunk_id=user_settings.livekit_outbound_trunk_id,
        dispatch_rule_id=user_settings.livekit_dispatch_rule_id,
        phone_number=user_settings.twilio_from_number,
        livekit_sip_uri=livekit_sip_uri,
        origination_uri=origination_uri,
    )


@router.delete("/sip/disconnect", response_model=SIPStatusResponse)
async def disconnect_sip(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )
    user_settings = result.scalar_one_or_none()
    if not user_settings or not user_settings.sip_configured:
        return SIPStatusResponse(configured=False)

    # Delete LiveKit SIP resources
    try:
        await delete_user_sip(
            user_settings.livekit_inbound_trunk_id,
            user_settings.livekit_outbound_trunk_id,
            user_settings.livekit_dispatch_rule_id,
        )
    except Exception:
        # Ignore errors during teardown; we still clear local state
        pass

    # Clear stored credentials and IDs
    user_settings.twilio_account_sid = None
    user_settings.twilio_auth_token = None
    user_settings.twilio_from_number = None
    user_settings.twilio_trunk_sid = None
    user_settings.twilio_termination_uri = None
    user_settings.twilio_sip_username = None
    user_settings.twilio_sip_password = None
    user_settings.livekit_inbound_trunk_id = None
    user_settings.livekit_outbound_trunk_id = None
    user_settings.livekit_dispatch_rule_id = None
    user_settings.sip_configured = False

    await db.commit()

    return SIPStatusResponse(configured=False)

