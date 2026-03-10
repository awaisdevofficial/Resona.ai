"""
Telephony API: connect/disconnect Twilio + LiveKit SIP, status, and outbound call.
Uses UserTelephonyConfig (encrypted credentials) and current_user auth.
"""
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.agent import Agent
from app.models.telephony import UserTelephonyConfig
from app.models.user import User
from app.services.call_service import make_outbound_call
from app.services.livekit_setup import LiveKitSetupService
from app.services.telephony_onboarding import onboard_user_telephony
from app.services.telephony_teardown import teardown_user_telephony

router = APIRouter()


class ConnectBody(BaseModel):
    twilio_account_sid: str
    twilio_auth_token: str
    twilio_phone_number: str


class ConnectResponse(BaseModel):
    status: str
    inbound_trunk_id: str | None
    outbound_trunk_id: str | None
    dispatch_rule_id: str | None


class DisconnectResponse(BaseModel):
    status: str


class StatusResponse(BaseModel):
    is_connected: bool
    phone_number: str | None
    inbound_trunk_id: str | None
    outbound_trunk_id: str | None
    dispatch_rule_id: str | None
    is_active: bool
    assigned_agent_id: str | None


class AssignAgentRequest(BaseModel):
    agent_id: str


class CompleteSetupBody(BaseModel):
    twilio_phone_number: str


class CallBody(BaseModel):
    to_phone_number: str


class CallResponse(BaseModel):
    room_name: str
    participant_id: str
    status: str


@router.post("/connect", response_model=ConnectResponse)
async def connect_telephony(
    body: ConnectBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Connect user's Twilio account and phone number; create trunk + LiveKit SIP resources."""
    phone = (body.twilio_phone_number or "").strip()
    if not phone:
        raise HTTPException(
            status_code=400,
            detail="Twilio phone number is required (e.g. +1234567890).",
        )
    try:
        config = await onboard_user_telephony(
            user_id=str(user.id),
            twilio_account_sid=body.twilio_account_sid,
            twilio_auth_token=body.twilio_auth_token,
            phone_number=phone,
            db=db,
            sip_server_ip=settings.SIP_SERVER_IP,
        )
        return ConnectResponse(
            status="connected",
            inbound_trunk_id=config.livekit_inbound_trunk_id,
            outbound_trunk_id=config.livekit_outbound_trunk_id,
            dispatch_rule_id=config.livekit_dispatch_rule_id,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/complete-setup", response_model=ConnectResponse)
async def complete_telephony_setup(
    body: CompleteSetupBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Complete telephony setup when you have Twilio config but missing phone number or LiveKit trunks.
    Runs LiveKit inbound/dispatch/outbound creation and updates the config.
    """
    phone_number = (body.twilio_phone_number or "").strip()
    if not phone_number:
        raise HTTPException(
            status_code=400,
            detail="twilio_phone_number is required (e.g. +1234567890)",
        )
    result = await db.execute(
        select(UserTelephonyConfig).where(UserTelephonyConfig.user_id == user.id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(
            status_code=400,
            detail="No telephony config. Connect in Settings first with Twilio credentials and number.",
        )
    if config.livekit_outbound_trunk_id:
        return ConnectResponse(
            status="connected",
            inbound_trunk_id=config.livekit_inbound_trunk_id,
            outbound_trunk_id=config.livekit_outbound_trunk_id,
            dispatch_rule_id=config.livekit_dispatch_rule_id,
        )
    if not config.twilio_trunk_sid or not config.twilio_sip_username:
        raise HTTPException(
            status_code=400,
            detail="Config missing trunk or SIP credentials. Disconnect and reconnect in Settings with Twilio credentials and phone number.",
        )
    sip_password = config.get_decrypted("twilio_sip_password")
    if not sip_password:
        raise HTTPException(
            status_code=400,
            detail="SIP password not found. Disconnect and reconnect in Settings.",
        )
    lk_svc = LiveKitSetupService()
    try:
        inbound_trunk_id = await lk_svc.create_inbound_trunk(phone_number, str(user.id))
        dispatch_rule_id = await lk_svc.create_dispatch_rule(inbound_trunk_id, str(user.id))
        outbound_trunk_id = await lk_svc.create_outbound_trunk(
            phone_number,
            config.twilio_trunk_sid,
            config.twilio_sip_username,
            sip_password,
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"LiveKit setup failed: {getattr(e, 'message', str(e))}",
        )
    config.twilio_phone_number = phone_number
    config.livekit_inbound_trunk_id = inbound_trunk_id
    config.livekit_dispatch_rule_id = dispatch_rule_id
    config.livekit_outbound_trunk_id = outbound_trunk_id
    config.is_active = True
    await db.commit()
    await db.refresh(config)
    return ConnectResponse(
        status="connected",
        inbound_trunk_id=inbound_trunk_id,
        outbound_trunk_id=outbound_trunk_id,
        dispatch_rule_id=dispatch_rule_id,
    )


@router.delete("/disconnect", response_model=DisconnectResponse)
async def disconnect_telephony(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove Twilio/LiveKit resources and delete UserTelephonyConfig."""
    await teardown_user_telephony(str(user.id), db)
    return DisconnectResponse(status="disconnected")


@router.get("/status", response_model=StatusResponse)
async def telephony_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return whether telephony is connected and stored IDs."""
    result = await db.execute(
        select(UserTelephonyConfig).where(UserTelephonyConfig.user_id == user.id)
    )
    config = result.scalar_one_or_none()
    if not config:
        return StatusResponse(
            is_connected=False,
            phone_number=None,
            inbound_trunk_id=None,
            outbound_trunk_id=None,
            dispatch_rule_id=None,
            is_active=False,
            assigned_agent_id=None,
        )
    return StatusResponse(
        is_connected=True,
        phone_number=config.twilio_phone_number,
        inbound_trunk_id=config.livekit_inbound_trunk_id,
        outbound_trunk_id=config.livekit_outbound_trunk_id,
        dispatch_rule_id=config.livekit_dispatch_rule_id,
        is_active=config.is_active,
        assigned_agent_id=str(config.assigned_agent_id) if config.assigned_agent_id else None,
    )


@router.patch("/assign-agent")
async def assign_agent(
    body: AssignAgentRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set which agent handles inbound calls to the user's connected number."""
    result = await db.execute(
        select(UserTelephonyConfig).where(UserTelephonyConfig.user_id == user.id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="No telephony config found")
    agent_uuid = UUID(body.agent_id)
    agent_result = await db.execute(
        select(Agent).where(
            Agent.id == agent_uuid,
            Agent.user_id == user.id,
            Agent.is_active.is_(True),
        )
    )
    if not agent_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Agent not found or not yours")
    config.assigned_agent_id = agent_uuid
    await db.commit()
    return {"assigned_agent_id": body.agent_id}


logger = logging.getLogger(__name__)


@router.post("/call", response_model=CallResponse)
async def place_call(
    body: CallBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Place outbound call via LiveKit SIP using user's trunk."""
    try:
        result = await make_outbound_call(
            user_id=str(user.id),
            to_phone_number=body.to_phone_number.strip(),
            db=db,
        )
        return CallResponse(
            room_name=result["room_name"],
            participant_id=result["participant_id"],
            status=result["call_status"],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Outbound call failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Failed to start outbound call. Check that Twilio is connected and the agent worker is running, or reconnect in Settings.",
        )
