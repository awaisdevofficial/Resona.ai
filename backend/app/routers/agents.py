from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from livekit.api import AccessToken, LiveKitAPI, VideoGrants
from app.config import settings
import httpx as _httpx

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.agent import Agent
from app.models.call import Call
from app.models.user import User
from app.schemas.agent import AgentCreate, AgentResponse, AgentUpdate


router = APIRouter()


@router.get("", response_model=List[AgentResponse])
async def list_agents(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Agent)
        .where(Agent.user_id == user.id, Agent.is_active.is_(True))
        .order_by(Agent.created_at.desc())
    )
    return result.scalars().all()


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
    body: AgentUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agent = await db.get(Agent, agent_id)
    if not agent or agent.user_id != user.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    for field, value in body.model_dump(exclude_none=True).items():
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
    import json

    agent = await db.get(Agent, agent_id)
    if not agent or agent.user_id != user.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    await db.refresh(agent)

    room_name = f"webcall-{uuid.uuid4()}"
    call_id = uuid.uuid4()

    # Create Call record so web test calls are persisted in Supabase
    call = Call(
        id=call_id,
        user_id=user.id,
        agent_id=agent.id,
        direction="inbound",
        status="ringing",
        livekit_room=room_name,
    )
    db.add(call)
    await db.commit()

    metadata = json.dumps({
        "system_prompt": agent.system_prompt,
        "first_message": agent.first_message,
        "llm_model": agent.llm_model or "gpt-4o-mini",
        "llm_temperature": agent.llm_temperature or 0.7,
        "llm_max_tokens": agent.llm_max_tokens or 500,
        "stt_language": agent.stt_language or "en-US",
        "tts_voice_id": agent.tts_voice_id or "Rachel",
        "tts_stability": agent.tts_stability or 0.5,
        "silence_timeout": agent.silence_timeout or 30,
        "max_duration": agent.max_duration or 3600,
        "call_id": str(call_id),
        "agent_speaks_first": agent.tools_config.get("agent_speaks_first", True) if agent.tools_config else True,
    })

    token = (
        AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        .with_identity(f"user-{user.id}")
        .with_name("Test User")
        .with_grants(VideoGrants(room_join=True, room=room_name))
        .with_metadata(metadata)
        .to_jwt()
    )

    async with LiveKitAPI(
        url=settings.LIVEKIT_URL,
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
    ) as lk:
        from livekit.api import CreateRoomRequest
        await lk.room.create_room(
            CreateRoomRequest(
                name=room_name,
                metadata=metadata,
            )
        )

    return {
        "token": token,
        "room_name": room_name,
        "livekit_url": settings.LIVEKIT_URL,
        "call_id": str(call_id),
    }


@router.post("/voice-preview-by-name")
async def voice_preview_by_name(
    body: dict,
    user: User = Depends(get_current_user),
):
    from fastapi.responses import StreamingResponse

    VOICE_NAME_TO_ID = {
        "Rachel": "21m00Tcm4TlvDq8ikWAM",
        "Drew": "29vD33N1vc5IkxM6UTqy",
        "Clyde": "2EiwWnXFnvU5JabPnv8n",
        "Paul": "5Q0t7uMcjvnagumLfvZi",
        "Domi": "AZnzlk1XvdvUeBnXmlld",
        "Dave": "CYw3kZ78EhJOlQCFuako",
        "Fin": "D38z5RcWu1voky8WS1ja",
        "Bella": "EXAVITQu4vr4xnSDxMaL",
        "Antoni": "ErXwobaYiN019PkySvjV",
        "Thomas": "GBv7mTt0atIp3Br8iCZE",
        "Charlie": "IKne3meq5aSn9XLyUdCD",
        "Emily": "LcfcDJNUP1GQjkzn1xUU",
        "Elli": "MF3mGyEYCl7XYWbV9V6O",
        "Callum": "N2lVS1w4EtoT3dr4eOWO",
        "Patrick": "ODq5zmih8GrVes37Dy9p",
        "Harry": "SOYHLrjzK2X1ezoPC6cr",
        "Liam": "TX3LPaxmHKxFdv7VOQHJ",
        "Dorothy": "ThT5KcBeYPX3keUQqHPh",
        "Josh": "TxGEqnHWrfWFTfGW9XjX",
        "Arnold": "VR6AewLTigWG4xSOukaG",
        "Charlotte": "XB0fDUnXU5powFXDhCwa",
        "Alice": "Xb7hH8MSUJpSbSDYk0k2",
        "Matilda": "XrExE9yKIg1WjnnlVkGX",
        "James": "ZQe5CZNOzWyzPSCn5a3c",
        "Joseph": "Zlb1dXrM653N07WRdFW3",
    }

    voice_name = body.get("voice_id", "Rachel")
    voice_id = VOICE_NAME_TO_ID.get(voice_name, "21m00Tcm4TlvDq8ikWAM")
    preview_text = f"Hi, I'm {voice_name}. I'm your AI voice assistant, ready to help you on every call."

    async def stream_audio():
        async with _httpx.AsyncClient(timeout=30) as client:
            async with client.stream(
                "POST",
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream",
                headers={
                    "xi-api-key": settings.ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                },
                json={
                    "text": preview_text,
                    "model_id": "eleven_turbo_v2",
                    "voice_settings": {"stability": 0.5, "similarity_boost": 0.8},
                },
            ) as resp:
                if resp.status_code != 200:
                    raise HTTPException(502, "ElevenLabs TTS failed")
                async for chunk in resp.aiter_bytes():
                    yield chunk

    return StreamingResponse(stream_audio(), media_type="audio/mpeg")


@router.post("/{agent_id}/voice-preview")
async def voice_preview(
    agent_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Calls ElevenLabs TTS with a fixed preview sentence using the agent's
    selected voice and streams the audio back to the browser.
    """
    from fastapi.responses import StreamingResponse

    agent = await db.get(Agent, agent_id)
    if not agent or agent.user_id != user.id:
        raise HTTPException(status_code=404, detail="Agent not found")

    VOICE_NAME_TO_ID = {
        "Rachel": "21m00Tcm4TlvDq8ikWAM",
        "Drew": "29vD33N1vc5IkxM6UTqy",
        "Clyde": "2EiwWnXFnvU5JabPnv8n",
        "Paul": "5Q0t7uMcjvnagumLfvZi",
        "Domi": "AZnzlk1XvdvUeBnXmlld",
        "Dave": "CYw3kZ78EhJOlQCFuako",
        "Fin": "D38z5RcWu1voky8WS1ja",
        "Bella": "EXAVITQu4vr4xnSDxMaL",
        "Antoni": "ErXwobaYiN019PkySvjV",
        "Thomas": "GBv7mTt0atIp3Br8iCZE",
        "Charlie": "IKne3meq5aSn9XLyUdCD",
        "Emily": "LcfcDJNUP1GQjkzn1xUU",
        "Elli": "MF3mGyEYCl7XYWbV9V6O",
        "Callum": "N2lVS1w4EtoT3dr4eOWO",
        "Patrick": "ODq5zmih8GrVes37Dy9p",
        "Harry": "SOYHLrjzK2X1ezoPC6cr",
        "Liam": "TX3LPaxmHKxFdv7VOQHJ",
        "Dorothy": "ThT5KcBeYPX3keUQqHPh",
        "Josh": "TxGEqnHWrfWFTfGW9XjX",
        "Arnold": "VR6AewLTigWG4xSOukaG",
        "Charlotte": "XB0fDUnXU5powFXDhCwa",
        "Alice": "Xb7hH8MSUJpSbSDYk0k2",
        "Matilda": "XrExE9yKIg1WjnnlVkGX",
        "James": "ZQe5CZNOzWyzPSCn5a3c",
        "Joseph": "Zlb1dXrM653N07WRdFW3",
    }
    voice_name = agent.tts_voice_id or "Rachel"
    voice_id = VOICE_NAME_TO_ID.get(voice_name, "21m00Tcm4TlvDq8ikWAM")
    preview_text = (
        f"Hi, I'm {agent.name}. "
        "I'm your AI voice assistant, ready to help you on every call."
    )

    async def stream_audio():
        async with _httpx.AsyncClient(timeout=30) as client:
            async with client.stream(
                "POST",
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream",
                headers={
                    "xi-api-key": settings.ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                },
                json={
                    "text": preview_text,
                    "model_id": "eleven_turbo_v2",
                    "voice_settings": {
                        "stability": agent.tts_stability or 0.5,
                        "similarity_boost": 0.8,
                    },
                },
            ) as resp:
                if resp.status_code != 200:
                    raise HTTPException(502, "ElevenLabs TTS failed")
                async for chunk in resp.aiter_bytes():
                    yield chunk

    return StreamingResponse(stream_audio(), media_type="audio/mpeg")

