import asyncio
import json
import logging
import os
from datetime import datetime
from typing import List, Optional
from urllib.parse import urlparse
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.system_settings import get_openai_keys_ordered
from app.constants import DEFAULT_CARTESIA_VOICE_ID
from app.database import AsyncSessionLocal, get_db
from app.prompts import get_full_system_prompt
from app.middleware.auth import get_current_user, verify_internal_secret
from app.models.agent import Agent
from app.models.call import Call
from app.models.phone_number import PhoneNumber
from app.models.knowledge_base import KnowledgeBase
from app.models.phone_number import PhoneNumber
from app.models.user import User
from app.models.user_settings import UserSettings
from app.models.telephony import UserTelephonyConfig
from app.models.webhook import Webhook
from app.schemas.call import (
    CallCreate,
    CallResponse,
    TranscriptTurn,
    CallCompleteRequest,
    TranscriptBatch,
)
from app.services.call_service import initiate_outbound_call

logger = logging.getLogger(__name__)
router = APIRouter()
internal_router = APIRouter()


async def analyze_call(transcript_lines: list, call_id: str) -> None:
    if not transcript_lines:
        return
    keys = get_openai_keys_ordered()
    if not keys:
        logger.warning("No OPENAI_API_KEY in api-keys table; skipping post-call analysis")
        return
    transcript_text = "\n".join(
        [
            f"{line.get('role', 'user').upper()}: {line.get('text', '')}"
            for line in transcript_lines
        ]
    )
    from openai import AsyncOpenAI

    last_err: Exception | None = None
    for api_key in keys:
        try:
            client = AsyncOpenAI(api_key=api_key)
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "user",
                        "content": f"""Analyze this call transcript and respond ONLY with valid JSON:
{{
  "summary": "2-3 sentence summary of the call",
  "sentiment": "positive" | "neutral" | "negative",
  "intent": "main reason the caller called",
  "outcome": "what was resolved or what happened",
  "transferred": true | false
}}

Transcript:
{transcript_text}""",
                    }
                ],
                max_tokens=500,
            )
            raw = response.choices[0].message.content
            analysis = json.loads(raw)
            async with AsyncSessionLocal() as db:
                call = await db.get(Call, uuid.UUID(call_id))
                if call:
                    call.summary = analysis.get("summary", "")
                    call.analysis = analysis
                    await db.commit()
            return
        except Exception as e:
            last_err = e
            logger.debug("OpenAI analysis failed with key, trying next row: %s", e)
    if last_err:
        logger.warning("Post-call analysis failed for all keys: %s", last_err)


async def trigger_webhooks(
    user_id: str, event: str, payload: dict
) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Webhook).where(
                Webhook.user_id == uuid.UUID(user_id),
                Webhook.is_active.is_(True),
            )
        )
        webhooks = result.scalars().all()
        for webhook in webhooks:
            if event not in (webhook.events or []):
                continue
            try:
                import hmac
                import hashlib

                body = json.dumps({"event": event, "data": payload})
                secret = (webhook.secret or "").encode()
                sig = hmac.new(
                    secret,
                    body.encode(),
                    hashlib.sha256,
                ).hexdigest()
                async with httpx.AsyncClient(timeout=10) as client:
                    await client.post(
                        webhook.url,
                        content=body,
                        headers={
                            "Content-Type": "application/json",
                            "X-Resona-Signature": sig,
                            "X-Resona-Event": event,
                        },
                    )
            except Exception as e:
                logger.warning("Webhook delivery failed: %s", e)


@router.post("/outbound")
async def make_outbound_call(
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Initiate an outbound call using the user's Twilio phone setup."""
    from livekit import api as livekit_api
    from livekit.protocol.room import CreateRoomRequest
    from app.services.sip_service import make_outbound_sip_call

    agent_id = body.get("agent_id")
    to_number = body.get("to_number")

    if not agent_id:
        raise HTTPException(status_code=400, detail="agent_id is required")
    if not to_number:
        raise HTTPException(status_code=400, detail="to_number is required")

    # Get user SIP settings: prefer UserSettings (Settings → SIP), fallback to UserTelephonyConfig (telephony/connect)
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )
    user_settings = result.scalar_one_or_none()

    outbound_trunk_id: Optional[str] = None
    from_number: Optional[str] = None

    if user_settings and user_settings.sip_configured and user_settings.livekit_outbound_trunk_id:
        outbound_trunk_id = user_settings.livekit_outbound_trunk_id
        from_number = user_settings.twilio_from_number

    if not outbound_trunk_id:
        tel_result = await db.execute(
            select(UserTelephonyConfig).where(
                UserTelephonyConfig.user_id == user.id,
                UserTelephonyConfig.livekit_outbound_trunk_id.isnot(None),
            )
        )
        telephony_config = tel_result.scalar_one_or_none()
        if telephony_config and telephony_config.livekit_outbound_trunk_id:
            outbound_trunk_id = telephony_config.livekit_outbound_trunk_id
            from_number = telephony_config.twilio_phone_number

    if not outbound_trunk_id:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "sip_not_configured",
                "message": "Phone setup is incomplete. In Settings → Integrations, use \"Complete setup\" to add your Twilio number and create call trunks, or disconnect and reconnect with your number.",
                "setup_url": "/settings",
            },
        )

    # Get agent
    agent = await db.get(Agent, uuid.UUID(agent_id))
    if not agent or agent.user_id != user.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    await db.refresh(agent)

    # Prefer from_number from agent's assigned number (use_for outbound or both)
    num_result = await db.execute(
        select(PhoneNumber).where(
            PhoneNumber.agent_id == agent.id,
            PhoneNumber.user_id == user.id,
            PhoneNumber.is_active.is_(True),
            PhoneNumber.use_for.in_(("outbound", "both")),
        )
    )
    agent_number = num_result.scalar_one_or_none()
    if agent_number:
        from_number = agent_number.number

    # Fetch KB
    kb_result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.agent_id == agent.id)
    )
    kb_entries = kb_result.scalars().all()
    knowledge_base = "\n\n".join([f"[{e.name}]\n{e.content}" for e in kb_entries])

    voice_id = (
        (agent.tts_voice_id or "").strip()
        or (getattr(settings, "CARTESIA_DEFAULT_VOICE_ID", None) or "").strip()
        or DEFAULT_CARTESIA_VOICE_ID
    )
    llm_max_tokens = min(150, int(agent.llm_max_tokens or 150))

    # Create room with metadata (Deepgram STT, Groq LLM, Cartesia TTS)
    room_name = f"sip-{user.id}-{uuid.uuid4()}"
    call_id = uuid.uuid4()

    full_system_prompt = get_full_system_prompt(agent.system_prompt)
    metadata = json.dumps(
        {
            "system_prompt": full_system_prompt,
            "first_message": (agent.first_message or "Hey, hi! What can I do for you?").strip(),
            "stt_language": (agent.stt_language or "en").strip() or "en",
            "tts_language": (getattr(agent, "tts_language", None) or agent.stt_language or "en").strip() or "en",
            "tts_voice_id": voice_id,
            "llm_model": (agent.llm_model or "llama-3.3-70b-versatile").strip(),
            "llm_temperature": agent.llm_temperature if agent.llm_temperature is not None else 0.8,
            "llm_max_tokens": llm_max_tokens,
            "silence_timeout": int(agent.silence_timeout or 30),
            "max_duration": int(agent.max_duration or 3600),
            "call_id": str(call_id),
            "agent_speaks_first": True,
            "user_id": str(user.id),
            "knowledge_base": knowledge_base,
            "transfer_number": getattr(agent, "transfer_number", None) or (agent.tools_config or {}).get("transfer_number", ""),
        }
    )

    # Create LiveKit room (use settings.LIVEKIT_API_URL for consistency)
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

    # Save call record
    call = Call(
        id=call_id,
        agent_id=agent.id,
        user_id=user.id,
        direction="outbound",
        status="ringing",
        to_number=to_number,
        from_number=from_number,
        livekit_room=room_name,
    )
    db.add(call)
    await db.commit()

    # Initiate outbound SIP call via LiveKit
    await make_outbound_sip_call(
        outbound_trunk_id=outbound_trunk_id,
        to_number=to_number,
        room_name=room_name,
    )

    return {"call_id": str(call_id), "status": "ringing", "room": room_name}


@router.get("", response_model=List[CallResponse])
async def list_calls(
    agent_id: Optional[uuid.UUID] = Query(None),
    status: Optional[str] = Query(None),
    direction: Optional[str] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filters = [Call.user_id == user.id]
    if agent_id:
        filters.append(Call.agent_id == agent_id)
    if status:
        filters.append(Call.status == status)
    if direction:
        filters.append(Call.direction == direction)
    if from_date:
        filters.append(Call.created_at >= from_date)
    if to_date:
        filters.append(Call.created_at <= to_date)

    result = await db.execute(
        select(Call)
        .where(and_(*filters))
        .order_by(Call.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/{call_id}", response_model=CallResponse)
async def get_call(
    call_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    call = await db.get(Call, call_id)
    if not call or call.user_id != user.id:
        raise HTTPException(status_code=404, detail="Call not found")
    return call


@router.post("", response_model=CallResponse, status_code=201)
async def create_outbound_call(
    body: CallCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agent = await db.get(Agent, body.agent_id)
    if not agent or agent.user_id != user.id:
        raise HTTPException(status_code=404, detail="Agent not found")

    call = Call(
        id=uuid.uuid4(),
        user_id=user.id,
        agent_id=agent.id,
        direction="outbound",
        status="queued",
        to_number=body.to_number,
        metadata_json=body.metadata or {},
    )
    db.add(call)
    await db.commit()
    await db.refresh(call)

    try:
        twilio_sid = await initiate_outbound_call(
            agent, user, body.to_number, str(call.id), db
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    call.twilio_sid = twilio_sid
    call.status = "ringing"
    await db.commit()

    return call


@router.post("/{call_id}/end")
async def end_call(
    call_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    call = await db.get(Call, call_id)
    if not call or call.user_id != user.id:
        raise HTTPException(status_code=404, detail="Call not found")
    if call.twilio_sid:
        try:
            from app.services.twilio_client import get_twilio_client
            client = await get_twilio_client(user, db)
            client.calls(call.twilio_sid).update(status="completed")
        except ValueError:
            pass
    return {"status": "ok"}


@internal_router.post("/{call_id}/transcript")
async def save_transcript_batch(
    call_id: uuid.UUID,
    body: TranscriptBatch,
    _: None = Depends(verify_internal_secret),
    db: AsyncSession = Depends(get_db),
):
    call = await db.get(Call, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    lines = [line.model_dump() for line in body.lines]
    call.transcript = lines

    now = datetime.utcnow()
    if not call.started_at:
        call.started_at = now
    call.ended_at = now
    call.duration_seconds = body.duration_seconds

    if call.status in {"queued", "ringing", "in_progress"}:
        call.status = "completed"

    await db.commit()
    await db.refresh(call)

    asyncio.create_task(analyze_call(lines, str(call_id)))

    asyncio.create_task(
        trigger_webhooks(
            str(call.user_id),
            "call.completed",
            {
                "call_id": str(call.id),
                "agent_id": str(call.agent_id) if call.agent_id else None,
                "duration_seconds": body.duration_seconds,
                "transcript": lines,
                "summary": getattr(call, "summary", None),
            },
        )
    )
    return {"status": "ok"}


@router.post("/{call_id}/transcript")
async def append_transcript_user(
    call_id: uuid.UUID,
    body: TranscriptTurn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    call = await db.get(Call, call_id)
    if not call or call.user_id != user.id:
        raise HTTPException(status_code=404, detail="Call not found")

    transcript = list(call.transcript or [])
    transcript.append(body.model_dump())
    call.transcript = transcript
    if call.status == "ringing":
        call.status = "in_progress"
        call.started_at = datetime.utcnow()
    await db.commit()
    return {"status": "ok"}


@router.post("/{call_id}/complete")
async def complete_call(
    call_id: uuid.UUID,
    body: CallCompleteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    call = await db.get(Call, call_id)
    if not call or call.user_id != user.id:
        raise HTTPException(status_code=404, detail="Call not found")

    call.duration_seconds = body.duration_seconds
    call.ended_at = datetime.utcnow()
    call.status = "completed"
    if body.end_reason:
        call.end_reason = body.end_reason
    if body.recording_url:
        call.recording_url = body.recording_url

    await db.commit()
    return {"status": "ok"}

