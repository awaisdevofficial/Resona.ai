from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import verify_internal_secret
from app.models.agent import Agent
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

    We pick the first active agent (most recently created) for the user.
    """
    result = await db.execute(
        select(Agent)
        .where(Agent.user_id == user_id, Agent.is_active.is_(True))
        .order_by(Agent.created_at.desc())
    )
    agent = result.scalars().first()
    if not agent:
        raise HTTPException(status_code=404, detail="No active agent found for user")

    await db.refresh(agent)

    # Minimal config required by the agent worker; can be extended as needed
    full_system_prompt = get_full_system_prompt(agent.system_prompt)
    return {
        "system_prompt": full_system_prompt,
        "first_message": agent.first_message or "Hi, how can I help you today?",
        "tts_provider": agent.tts_provider or "cartesia",
        "tts_voice_id": agent.tts_voice_id or "default",
    }

