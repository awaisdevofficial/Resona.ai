import logging
import os
from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.prompts import HUMAN_BEHAVIOR_PROMPT, get_full_system_prompt
from livekit.api import AccessToken, LiveKitAPI, VideoGrants
from app.config import settings
from app.constants import DEFAULT_ELEVENLABS_VOICE_ID
import httpx as _httpx

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.agent import Agent
from app.models.call import Call
from app.models.knowledge_base import KnowledgeBase
from app.models.user import User
from app.schemas.agent import AgentCreate, AgentResponse, AgentUpdate


router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("", response_model=List[AgentResponse])
async def list_agents(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(
            select(Agent)
            .where(Agent.user_id == user.id, Agent.is_active.is_(True))
            .order_by(Agent.created_at.desc())
        )
        return result.scalars().all()
    except ProgrammingError as e:
        logger.warning("agents query failed (schema?): %s", e)
        raise HTTPException(
            status_code=503,
            detail="Database schema may be outdated. Ensure all migrations are applied.",
        ) from e


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    body: AgentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agent = Agent(id=uuid.uuid4(), user_id=user.id, **body.model_dump())
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agent = await db.get(Agent, agent_id)
    if not agent or agent.user_id != user.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: uuid.UUID,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agent = await db.get(Agent, agent_id)
    if not agent or agent.user_id != user.id:
        raise HTTPException(status_code=404, detail="Agent not found")

    await db.refresh(agent)

    allowed_fields = [
        "name",
        "description",
        "system_prompt",
        "first_message",
        "llm_model",
        "llm_temperature",
        "llm_max_tokens",
        "stt_provider",
        "stt_model",
        "stt_language",
        "tts_provider",
        "tts_voice_id",
        "tts_model",
        "tts_stability",
        "silence_timeout",
        "max_duration",
        "tools_config",
        "is_active",
    ]
    for field, value in body.items():
        if field in allowed_fields and hasattr(agent, field):
            setattr(agent, field, value)

    await db.commit()
    await db.refresh(agent)
    return agent


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    agent_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agent = await db.get(Agent, agent_id)
    if not agent or agent.user_id != user.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.is_active = False
    await db.commit()


@router.post("/{agent_id}/duplicate", response_model=AgentResponse, status_code=201)
async def duplicate_agent(
    agent_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agent = await db.get(Agent, agent_id)
    if not agent or agent.user_id != user.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    new_agent = Agent(
        id=uuid.uuid4(),
        user_id=user.id,
        name=f"{agent.name} (copy)",
        description=agent.description,
        system_prompt=agent.system_prompt,
        first_message=agent.first_message,
        llm_model=agent.llm_model,
        llm_temperature=agent.llm_temperature,
        llm_max_tokens=agent.llm_max_tokens,
        stt_provider=agent.stt_provider,
        stt_model=agent.stt_model,
        stt_language=agent.stt_language,
        tts_provider=agent.tts_provider,
        tts_voice_id=agent.tts_voice_id,
        tts_model=getattr(agent, "tts_model", None) if hasattr(agent, "tts_model") else None,
        tts_stability=agent.tts_stability,
        silence_timeout=agent.silence_timeout,
        max_duration=agent.max_duration,
        tools_config=agent.tools_config,
    )
    db.add(new_agent)
    await db.commit()
    await db.refresh(new_agent)
    return new_agent


@router.post("/{agent_id}/web-call-token")
async def create_web_call_token(
    agent_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import logging
    log = logging.getLogger(__name__)

    try:
        return await _create_web_call_token_impl(agent_id, user, db)
    except HTTPException:
        raise
    except Exception as e:
        log.exception("web-call-token failed")
        raise HTTPException(status_code=500, detail=str(e))


async def _create_web_call_token_impl(
    agent_id: uuid.UUID,
    user: User,
    db: AsyncSession,
):
    import json

    agent = await db.get(Agent, agent_id)
    if not agent or agent.user_id != user.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    await db.refresh(agent)

    room_name = f"webcall-{uuid.uuid4()}"
    call_id = uuid.uuid4()

    voice_id = (agent.tts_voice_id or "").strip() or DEFAULT_ELEVENLABS_VOICE_ID

    full_system_prompt = get_full_system_prompt(agent.system_prompt)
    max_kb = getattr(settings, "MAX_KNOWLEDGE_BASE_LEN_FOR_TOKEN", 8000)

    kb_result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.agent_id == agent.id)
    )
    kb_entries = kb_result.scalars().all()
    knowledge_base_raw = "\n\n".join([f"[{e.name}]\n{e.content}" for e in kb_entries])
    knowledge_base_for_room = knowledge_base_raw[:max_kb] if len(knowledge_base_raw) > max_kb else knowledge_base_raw

    # Full room metadata (agent worker reads ctx.room.metadata). Stored on LiveKit server, not in URL.
    room_metadata_dict = {
        "type": "web_test",
        "test_title": f"Test call – {agent.name}",
        "agent_id": str(agent.id),
        "agent_name": agent.name,
        "user_id": str(user.id),
        "user_email": user.email,
        "system_prompt": full_system_prompt,
        "first_message": (agent.first_message or "Hey, hi! What can I do for you?").strip()[:2000],
        "llm_model": agent.llm_model or "gpt-4o",
        "llm_temperature": agent.llm_temperature if agent.llm_temperature is not None else 0.8,
        "llm_max_tokens": agent.llm_max_tokens or 300,
        "stt_provider": "elevenlabs",
        "stt_model": agent.stt_model or "scribe_v2_realtime",
        "stt_language": agent.stt_language or "en-US",
        "tts_provider": "elevenlabs",
        "tts_voice_id": voice_id,
        "tts_model": getattr(agent, "tts_model", None) or "eleven_turbo_v2_5",
        "tts_stability": agent.tts_stability if agent.tts_stability is not None else 0.45,
        "silence_timeout": int(agent.silence_timeout or 30),
        "max_duration": int(agent.max_duration or 3600),
        "call_id": str(call_id),
        "agent_speaks_first": agent.tools_config.get("agent_speaks_first", True)
        if agent.tools_config
        else True,
        "transfer_number": (agent.tools_config or {}).get("transfer_number", ""),
        "knowledge_base": knowledge_base_for_room,
    }

    # Token metadata must stay tiny (sent in URL) to avoid 414 Request-URI Too Large.
    # Agent worker reads room metadata, not token metadata.
    token_metadata_dict = {
        "type": "web_test",
        "agent_id": str(agent.id),
        "call_id": str(call_id),
        "user_id": str(user.id),
    }

    # Create Call record so web test calls are persisted
    call = Call(
        id=call_id,
        user_id=user.id,
        agent_id=agent.id,
        direction="inbound",
        status="ringing",
        livekit_room=room_name,
        metadata_json=room_metadata_dict,
    )
    db.add(call)
    await db.commit()

    room_metadata = json.dumps(room_metadata_dict)
    token_metadata = json.dumps(token_metadata_dict)

    token = (
        AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        .with_identity(f"user-{user.id}")
        .with_name("Test User")
        .with_grants(VideoGrants(room_join=True, room=room_name))
        .with_metadata(token_metadata)
        .to_jwt()
    )

    api_url = (settings.LIVEKIT_API_URL or "").strip()
    if not api_url:
        raise HTTPException(
            status_code=503,
            detail="LIVEKIT_API_URL is not configured.",
        )
    try:
        async with LiveKitAPI(
            url=api_url,
            api_key=settings.LIVEKIT_API_KEY,
            api_secret=settings.LIVEKIT_API_SECRET,
        ) as lk:
            from livekit.api import CreateRoomRequest
            await lk.room.create_room(
                CreateRoomRequest(
                    name=room_name,
                    metadata=room_metadata,
                )
            )
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=(
                "Could not create LiveKit room. If the backend runs in Docker, set "
                "LIVEKIT_API_URL to the host address (e.g. http://172.31.18.18:7880), not 127.0.0.1. "
                f"Error: {e!s}"
            ),
        )

    return {
        "token": token,
        "room_name": room_name,
        "livekit_url": settings.LIVEKIT_URL,
        "call_id": str(call_id),
    }

