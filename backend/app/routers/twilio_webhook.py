from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from twilio.twiml.voice_response import Dial, VoiceResponse

from app.config import settings
from app.database import get_db
from app.models.agent import Agent
from app.models.call import Call
from app.models.phone_number import PhoneNumber


router = APIRouter()


@router.post("/inbound")
async def handle_inbound(request: Request, db: AsyncSession = Depends(get_db)):
    form = await request.form()
    to_number = form.get("To", "")
    from_number = form.get("From", "")
    twilio_sid = form.get("CallSid", "")

    # Find phone number -> agent -> user
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

    # Create call record
    call = Call(
        id=uuid.uuid4(),
        agent_id=agent.id,
        user_id=agent.user_id,
        phone_number_id=phone_record.id,
        direction="inbound",
        status="ringing",
        to_number=to_number,
        from_number=from_number,
        twilio_sid=twilio_sid,
        livekit_room=f"call-{uuid.uuid4()}",
    )
    db.add(call)
    await db.commit()

    # Return TwiML pointing to LiveKit SIP
    twiml = VoiceResponse()
    dial = Dial(answer_on_bridge=True, timeout=90)
    dial.sip(settings.LIVEKIT_SIP_URI)
    twiml.append(dial)
    return Response(str(twiml), media_type="application/xml")


@router.post("/outbound-status")
async def outbound_status(request: Request, db: AsyncSession = Depends(get_db)):
    form = await request.form()
    twilio_sid = form.get("CallSid", "")
    call_status = form.get("CallStatus", "")
    duration = form.get("CallDuration")
    recording_url = form.get("RecordingUrl")

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
        if recording_url:
            call.recording_url = recording_url
        await db.commit()

    return PlainTextResponse("OK")

