# ---------------------------------------------------------------------------
# SETUP INSTRUCTIONS FOR INBOUND CALLS
# ---------------------------------------------------------------------------
# 1. Go to Twilio Console → Phone Numbers → your number
# 2. Set "A call comes in" webhook to: https://resona.duckdns.org/twilio/inbound
# 3. Method: HTTP POST
# 4. Set Status Callback to: https://resona.duckdns.org/twilio/status
# ---------------------------------------------------------------------------
# For outbound calls, ensure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and
# TWILIO_FROM_NUMBER are set in .env
# ---------------------------------------------------------------------------

from datetime import datetime
import json
import os
import uuid

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import PlainTextResponse
from livekit import api as livekit_api
from livekit.protocol.room import CreateRoomRequest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from twilio.twiml.voice_response import Dial, VoiceResponse

from app.prompts import get_full_system_prompt

from app.config import settings
from app.database import get_db
from app.models.agent import Agent
from app.models.call import Call
from app.models.knowledge_base import KnowledgeBase
from app.models.phone_number import PhoneNumber


router = APIRouter()


@router.post("/inbound")
async def handle_inbound(request: Request, db: AsyncSession = Depends(get_db)):
    form = await request.form()
    to_number = form.get("To", "")
    from_number = form.get("From", "")
    twilio_sid = form.get("CallSid", "")

    result = await db.execute(
        select(PhoneNumber).where(
            PhoneNumber.number == to_number,
            PhoneNumber.is_active.is_(True),
        )
    )
    phone_record = result.scalar_one_or_none()

    if not phone_record or not phone_record.agent_id:
        twiml = VoiceResponse()
        twiml.say("This number has no agent assigned. Goodbye.")
        twiml.hangup()
        return Response(str(twiml), media_type="application/xml")

    agent = await db.get(Agent, phone_record.agent_id)
    await db.refresh(agent)

    room_name = f"call-{uuid.uuid4()}"
    call_id = uuid.uuid4()

    kb_result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.agent_id == agent.id)
    )
    kb_entries = kb_result.scalars().all()
    knowledge_base = "\n\n".join([f"[{e.name}]\n{e.content}" for e in kb_entries])

    full_system_prompt = get_full_system_prompt(agent.system_prompt)
    metadata = json.dumps({
        "system_prompt": full_system_prompt,
        "first_message": agent.first_message or "Hi, how can I help you today?",
        "tts_provider": agent.tts_provider or "cartesia",
        "tts_voice_id": agent.tts_voice_id or "aura-asteria-en",
        "silence_timeout": int(agent.silence_timeout or 30),
        "max_duration": int(agent.max_duration or 3600),
        "call_id": str(call_id),
        "agent_speaks_first": agent.tools_config.get("agent_speaks_first", True) if agent.tools_config else True,
        "transfer_number": agent.tools_config.get("transfer_number", "") if agent.tools_config else "",
        "knowledge_base": knowledge_base,
    })

    call = Call(
        id=call_id,
        agent_id=agent.id,
        user_id=agent.user_id,
        phone_number_id=phone_record.id,
        direction="inbound",
        status="ringing",
        to_number=to_number,
        from_number=from_number,
        twilio_sid=twilio_sid,
        livekit_room=room_name,
    )
    db.add(call)
    await db.commit()

    # Create LiveKit room with metadata
    async with livekit_api.LiveKitAPI(
        url=os.environ.get("LIVEKIT_API_URL", "http://54.151.186.116:7880"),
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
    ) as lk:
        await lk.room.create_room(
            CreateRoomRequest(name=room_name, metadata=metadata)
        )

    # SIP URI to connect Twilio to LiveKit (room as query param so LiveKit routes to correct room)
    livekit_host = settings.LIVEKIT_URL.replace("wss://", "").replace("ws://", "").split("/")[0]
    sip_uri = f"sip:{settings.LIVEKIT_API_KEY}@{livekit_host}?room={room_name}"

    twiml = VoiceResponse()
    dial = Dial(answer_on_bridge=True, timeout=30, action=f"{settings.API_BASE_URL}/twilio/status")
    dial.sip(sip_uri, sip_method="POST")
    twiml.append(dial)
    return Response(str(twiml), media_type="application/xml")


@router.post("/status")
async def handle_status(request: Request, db: AsyncSession = Depends(get_db)):
    """Twilio calls this when call status changes (completed, failed, no-answer, busy)."""
    form = await request.form()
    twilio_sid = form.get("CallSid", "")
    call_status = form.get("CallStatus", "")
    duration = form.get("CallDuration")

    status_map = {
        "completed": "completed",
        "failed": "failed",
        "no-answer": "no_answer",
        "busy": "busy",
        "canceled": "failed",
    }

    result = await db.execute(select(Call).where(Call.twilio_sid == twilio_sid))
    call = result.scalar_one_or_none()
    if call:
        call.status = status_map.get(call_status, call.status)
        if duration:
            call.duration_seconds = int(duration)
        call.ended_at = datetime.utcnow()
        await db.commit()

    return PlainTextResponse("OK")
