from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import DEFAULT_ELEVENLABS_VOICE_ID
from app.database import get_db
from app.middleware.auth import verify_internal_secret
from app.models.agent import Agent
from app.models.knowledge_base import KnowledgeBase
from app.models.telephony import UserTelephonyConfig
from app.prompts import get_full_system_prompt


router = APIRouter(dependencies=[Depends(verify_internal_secret)])


@router.get("/users/{user_id}/default-agent")
async def get_default_agent_config(
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Return the default agent configuration for a user, used by the agent worker
    to handle inbound SIP calls where the room is created by a dispatch rule.

    If the user has a telephony config with an assigned agent, use that agent.
    Otherwise pick the first active agent (most recently created) for the user.
    """
    user_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
    agent = None

    # Check if user has a specific agent assigned to their phone number
    tel_result = await db.execute(
        select(UserTelephonyConfig).where(
            UserTelephonyConfig.user_id == user_uuid,
            UserTelephonyConfig.assigned_agent_id.isnot(None),
        )
    )
    tel_config = tel_result.scalars().first()
    if tel_config and tel_config.assigned_agent_id:
        agent_result = await db.execute(
            select(Agent).where(
                Agent.id == tel_config.assigned_agent_id,
                Agent.is_active.is_(True),
            )
        )
        assigned_agent = agent_result.scalars().first()
        if assigned_agent:
            agent = assigned_agent

    if not agent:
        result = await db.execute(
            select(Agent)
            .where(Agent.user_id == user_uuid, Agent.is_active.is_(True))
            .order_by(Agent.created_at.desc())
        )
        agent = result.scalars().first()
    if not agent:
        raise HTTPException(status_code=404, detail="No active agent found for user")

    await db.refresh(agent)

    kb_result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.agent_id == agent.id)
    )
    kb_entries = kb_result.scalars().all()
    knowledge_base = "\n\n".join([f"[{e.name}]\n{e.content}" for e in kb_entries])

    full_system_prompt = get_full_system_prompt(agent.system_prompt)
    tts_voice_id = (agent.tts_voice_id or "").strip() or DEFAULT_ELEVENLABS_VOICE_ID
    return {
        "system_prompt": full_system_prompt,
        "first_message": (agent.first_message or "Hey, hi! What can I do for you?").strip(),
        "stt_provider": "elevenlabs",
        "stt_language": agent.stt_language or "en-US",
        "tts_provider": "elevenlabs",
        "tts_voice_id": tts_voice_id,
        "tts_stability": agent.tts_stability if agent.tts_stability is not None else 0.45,
        "llm_model": agent.llm_model or "gpt-4o",
        "llm_temperature": agent.llm_temperature if agent.llm_temperature is not None else 0.8,
        "llm_max_tokens": agent.llm_max_tokens or 300,
        "knowledge_base": knowledge_base,
        "agent_speaks_first": True,
        "transfer_number": (agent.tools_config or {}).get("transfer_number", ""),
    }

