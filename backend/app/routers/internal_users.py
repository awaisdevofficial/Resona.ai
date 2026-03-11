from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.constants import DEFAULT_CARTESIA_VOICE_ID, groq_llm_model_for_agent
from app.database import get_db
from app.middleware.auth import verify_internal_secret
from app.models.agent import Agent
from app.models.knowledge_base import KnowledgeBase
from app.models.phone_number import PhoneNumber
from app.models.telephony import UserTelephonyConfig
from app.models.user_settings import UserSettings
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

    Prefer: 1) UserTelephonyConfig.assigned_agent_id, 2) agent assigned to user's
    number in phone_numbers (Settings SIP), 3) first active agent for user.
    """
    user_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
    agent = None

    # 1) Telephony/connect: assigned agent on UserTelephonyConfig
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

    # 2) Settings SIP: agent assigned to user's from-number in phone_numbers
    if not agent:
        settings_result = await db.execute(
            select(UserSettings).where(
                UserSettings.user_id == user_uuid,
                UserSettings.sip_configured.is_(True),
                UserSettings.twilio_from_number.isnot(None),
            )
        )
        user_settings = settings_result.scalar_one_or_none()
        if user_settings and user_settings.twilio_from_number:
            pn_result = await db.execute(
                select(PhoneNumber).where(
                    PhoneNumber.user_id == user_uuid,
                    PhoneNumber.number == user_settings.twilio_from_number,
                    PhoneNumber.is_active.is_(True),
                    PhoneNumber.agent_id.isnot(None),
                )
            )
            pn = pn_result.scalar_one_or_none()
            if pn and pn.agent_id:
                agent = await db.get(Agent, pn.agent_id)
                if agent and not agent.is_active:
                    agent = None

    # 3) Fallback: first active agent for user
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
    tts_voice_id = (
        (agent.tts_voice_id or "").strip()
        or (getattr(settings, "CARTESIA_DEFAULT_VOICE_ID", None) or "").strip()
        or DEFAULT_CARTESIA_VOICE_ID
    )
    llm_max_tokens = min(150, int(agent.llm_max_tokens or 150))
    return {
        "system_prompt": full_system_prompt,
        "first_message": (agent.first_message or "Hey, hi! What can I do for you?").strip(),
        "stt_language": (agent.stt_language or "en").strip() or "en",
        "tts_voice_id": tts_voice_id,
        "llm_model": groq_llm_model_for_agent(agent.llm_model),
        "llm_temperature": agent.llm_temperature if agent.llm_temperature is not None else 0.8,
        "llm_max_tokens": llm_max_tokens,
        "knowledge_base": knowledge_base,
        "agent_speaks_first": True,
        "transfer_number": getattr(agent, "transfer_number", None) or (agent.tools_config or {}).get("transfer_number", ""),
    }

