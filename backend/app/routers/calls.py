import asyncio
import json
import logging
from datetime import datetime
from typing import List, Optional
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal, get_db
from app.middleware.auth import get_current_user, verify_internal_secret
from app.models.agent import Agent
from app.models.call import Call
from app.models.knowledge_base import KnowledgeBase
from app.models.phone_number import PhoneNumber
from app.models.user import User
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
    if not settings.GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not set; skipping post-call analysis")
        return
    transcript_text = "\n".join(
        [
            f"{line.get('role', 'user').upper()}: {line.get('text', '')}"
            for line in transcript_lines
        ]
    )
    try:
        from groq import AsyncGroq

        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
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
    except Exception as e:
        logger.warning("Post-call analysis failed: %s", e)


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
    """Initiate an outbound call: agent calls to_number via Twilio → LiveKit."""
    from twilio.rest import Client

    from livekit import api as livekit_api
    from livekit.protocol.room import CreateRoomRequest

    agent_id = body.get("agent_id")
    to_number = body.get("to_number")

    if not agent_id:
        raise HTTPException(status_code=400, detail="agent_id is required")
    if not to_number:
        raise HTTPException(status_code=400, detail="to_number is required")

    agent = await db.get(Agent, uuid.UUID(agent_id))
    if not agent or agent.user_id != user.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    await db.refresh(agent)

    # Get phone number assigned to this agent
    result = await db.execute(
        select(PhoneNumber).where(
            PhoneNumber.agent_id == agent.id,
            PhoneNumber.is_active.is_(True),
        )
    )
    phone_record = result.scalar_one_or_none()
    from_number = phone_record.number if phone_record else settings.TWILIO_FROM_NUMBER
    if not from_number:
        raise HTTPException(
            status_code=400,
            detail="No phone number assigned to this agent and TWILIO_FROM_NUMBER not set.",
        )

    room_name = f"call-{uuid.uuid4()}"
    call_id = uuid.uuid4()

    kb_result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.agent_id == agent.id)
    )
    kb_entries = kb_result.scalars().all()
    knowledge_base = "\n\n".join([f"[{e.name}]\n{e.content}" for e in kb_entries])

    metadata = json.dumps({
        "system_prompt": agent.system_prompt or "You are a helpful voice AI assistant.",
        "first_message": agent.first_message or "Hi, how can I help you today?",
        "tts_voice_id": agent.tts_voice_id or "Rachel",
        "silence_timeout": agent.silence_timeout or 30,
        "max_duration": agent.max_duration or 3600,
        "call_id": str(call_id),
        "agent_speaks_first": True,
        "transfer_number": agent.tools_config.get("transfer_number", "") if agent.tools_config else "",
        "knowledge_base": knowledge_base,
    })

    # Create LiveKit room first
    async with livekit_api.LiveKitAPI(
        url=settings.LIVEKIT_URL,
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
    ) as lk:
        await lk.room.create_room(
            CreateRoomRequest(name=room_name, metadata=metadata)
        )

    # Create call record
    call = Call(
        id=call_id,
        agent_id=agent.id,
        user_id=user.id,
        phone_number_id=phone_record.id if phone_record else None,
        direction="outbound",
        status="ringing",
        to_number=to_number,
        from_number=from_number,
        livekit_room=room_name,
    )
    db.add(call)
    await db.commit()

    # Initiate Twilio call
    livekit_host = settings.LIVEKIT_URL.replace("wss://", "").replace("ws://", "").split("/")[0]
    sip_uri = f"sip:{settings.LIVEKIT_API_KEY}@{livekit_host}?room={room_name}"

    client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    twilio_call = client.calls.create(
        to=to_number,
        from_=from_number,
        twiml=f'<Response><Dial answerOnBridge="true"><Sip>{sip_uri}</Sip></Dial></Response>',
        status_callback=f"{settings.API_BASE_URL}/twilio/status",
        status_callback_method="POST",
    )

    call.twilio_sid = twilio_call.sid
    await db.commit()

    return {"call_id": str(call_id), "twilio_sid": twilio_call.sid, "status": "ringing"}


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

    twilio_sid = await initiate_outbound_call(agent, user, body.to_number, str(call.id))
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
        from twilio.rest import Client

        from app.config import settings

        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        client.calls(call.twilio_sid).update(status="completed")
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

