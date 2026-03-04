from datetime import datetime
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user, verify_internal_secret
from app.models.agent import Agent
from app.models.call import Call
from app.models.user import User
from app.schemas.call import CallCreate, CallResponse, TranscriptTurn, CallCompleteRequest
from app.services.call_service import initiate_outbound_call


router = APIRouter()
internal_router = APIRouter()


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
async def append_transcript(
    call_id: uuid.UUID,
    body: TranscriptTurn,
    _: None = Depends(verify_internal_secret),
    db: AsyncSession = Depends(get_db),
):
    call = await db.get(Call, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    transcript = list(call.transcript or [])
    transcript.append(body.model_dump())
    call.transcript = transcript
    if call.status == "ringing":
        call.status = "in_progress"
        call.started_at = datetime.utcnow()
    await db.commit()
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

