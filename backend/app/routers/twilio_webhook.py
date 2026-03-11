# ---------------------------------------------------------------------------
# SETUP INSTRUCTIONS FOR INBOUND CALLS
# ---------------------------------------------------------------------------
# 1. Go to Twilio Console → Phone Numbers → your number
# 2. Set "A call comes in" webhook to: {API_BASE_URL}/twilio/inbound
# 3. Method: HTTP POST
# 4. Set Status Callback to: {API_BASE_URL}/twilio/status
# (API_BASE_URL is from .env, e.g. https://your-domain.com or https://your-domain.com/api)
# Twilio credentials are stored per-user in the database (Settings → Phone).
# ---------------------------------------------------------------------------

from datetime import datetime
import json
import logging
import os
import time
import uuid
from urllib.parse import urlparse

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import PlainTextResponse
from livekit import api as livekit_api
from livekit.protocol.room import CreateRoomRequest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from twilio.twiml.voice_response import Dial, VoiceResponse

from app.config import settings
from app.constants import DEFAULT_CARTESIA_VOICE_ID, groq_llm_model_for_agent
from app.database import get_db
from app.prompts import get_full_system_prompt
from app.models.agent import Agent
from app.models.call import Call
from app.models.knowledge_base import KnowledgeBase
from app.models.phone_number import PhoneNumber
from app.models.telephony import UserTelephonyConfig


router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/inbound")
async def handle_inbound(request: Request, db: AsyncSession = Depends(get_db)):
    t0 = time.perf_counter()
    form = await request.form()
    to_number = form.get("To", "")
    from_number = form.get("From", "")
    twilio_sid = form.get("CallSid", "")

    # Resolve agent: 1) phone_numbers (Settings Integrations), 2) UserTelephonyConfig (telephony/connect)
    agent = None
    phone_record = None
    user_id_for_call = None

    result = await db.execute(
        select(PhoneNumber).where(
            PhoneNumber.number == to_number,
            PhoneNumber.is_active.is_(True),
            PhoneNumber.use_for.in_(("inbound", "both")),
        )
    )
    phone_record = result.scalar_one_or_none()
    if phone_record and phone_record.agent_id:
        agent = await db.get(Agent, phone_record.agent_id)
        if agent:
            user_id_for_call = agent.user_id

    if not agent:
        tel_result = await db.execute(
            select(UserTelephonyConfig).where(
                UserTelephonyConfig.twilio_phone_number == to_number,
                UserTelephonyConfig.assigned_agent_id.isnot(None),
            )
        )
        telephony_config = tel_result.scalar_one_or_none()
        if telephony_config and telephony_config.assigned_agent_id:
            agent = await db.get(Agent, telephony_config.assigned_agent_id)
            if agent and agent.user_id == telephony_config.user_id:
                user_id_for_call = agent.user_id

    if not agent or not user_id_for_call:
        twiml = VoiceResponse()
        twiml.say("This number has no agent assigned. Goodbye.")
        twiml.hangup()
        return Response(str(twiml), media_type="application/xml")

    await db.refresh(agent)

    room_name = f"call-{uuid.uuid4()}"
    call_id = uuid.uuid4()

    kb_result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.agent_id == agent.id)
    )
    kb_entries = kb_result.scalars().all()
    knowledge_base = "\n\n".join([f"[{e.name}]\n{e.content}" for e in kb_entries])

    full_system_prompt = get_full_system_prompt(agent.system_prompt)
    tts_voice_id = (
        (agent.tts_voice_id or "").strip()
        or (getattr(settings, "CARTESIA_DEFAULT_VOICE_ID", None) or "").strip()
        or DEFAULT_CARTESIA_VOICE_ID
    )
    llm_max_tokens = min(150, int(agent.llm_max_tokens or 150))
    metadata = json.dumps({
        "system_prompt": full_system_prompt,
        "first_message": (agent.first_message or "Hey, hi! What can I do for you?").strip(),
        "stt_language": (agent.stt_language or "en").strip() or "en",
        "tts_voice_id": tts_voice_id,
        "llm_model": groq_llm_model_for_agent(agent.llm_model),
        "llm_temperature": agent.llm_temperature if agent.llm_temperature is not None else 0.8,
        "llm_max_tokens": llm_max_tokens,
        "silence_timeout": int(agent.silence_timeout or 30),
        "max_duration": int(agent.max_duration or 3600),
        "call_id": str(call_id),
        "agent_speaks_first": agent.tools_config.get("agent_speaks_first", True) if agent.tools_config else True,
        "transfer_number": (getattr(agent, "transfer_number", None) or "") or (agent.tools_config.get("transfer_number", "") if agent.tools_config else ""),
        "knowledge_base": knowledge_base,
    })

    call = Call(
        id=call_id,
        agent_id=agent.id,
        user_id=user_id_for_call,
        phone_number_id=phone_record.id if phone_record else None,
        direction="inbound",
        status="ringing",
        to_number=to_number,
        from_number=from_number,
        twilio_sid=twilio_sid,
        livekit_room=room_name,
    )
    db.add(call)
    await db.commit()

    # Store call SID in Redis for live transfer by room_id
    try:
        redis_url = getattr(settings, "REDIS_URL", "redis://redis:6379/0")
        r = aioredis.from_url(redis_url)
        await r.set(f"call_sid:{room_name}", twilio_sid, ex=3600)
        await r.aclose()
    except Exception:
        pass

    # Create LiveKit room with metadata (use settings so backend and worker use same server)
    t_before_room = time.perf_counter()
    livekit_url = (settings.LIVEKIT_API_URL or "").strip() or os.environ.get("LIVEKIT_API_URL", "")
    if not livekit_url and settings.LIVEKIT_URL:
        p = urlparse(settings.LIVEKIT_URL)
        scheme = "https" if (p.scheme or "").lower() == "wss" else "http"
        livekit_url = f"{scheme}://{p.netloc}"
    async with livekit_api.LiveKitAPI(
        url=livekit_url,
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
    ) as lk:
        await lk.room.create_room(
            CreateRoomRequest(name=room_name, metadata=metadata)
        )
    room_elapsed_ms = (time.perf_counter() - t_before_room) * 1000
    total_elapsed_ms = (time.perf_counter() - t0) * 1000
    logger.info(
        "[inbound] room=%s create_room_ms=%.0f total_webhook_ms=%.0f",
        room_name, room_elapsed_ms, total_elapsed_ms,
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
