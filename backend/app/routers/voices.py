from typing import List

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.constants import DEFAULT_CARTESIA_VOICE_ID, _is_cartesia_voice_id
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.models.voice_profile import VoiceProfile


router = APIRouter()


class Voice(BaseModel):
  id: str
  name: str
  provider: str
  gender: str | None = None
  description: str | None = None
  preview_url: str | None = None
  is_custom: bool = False


class VoicePreviewRequest(BaseModel):
  voice_id: str
  provider: str
  text: str


async def _get_user_voice_profiles(
  user: User,
  db: AsyncSession,
) -> list[Voice]:
  result = await db.execute(
    select(VoiceProfile).where(VoiceProfile.user_id == user.id)
  )
  profiles = result.scalars().all()
  voices: list[Voice] = []
  for profile in profiles:
    voices.append(
      Voice(
        id=profile.provider_voice_id,
        name=profile.name,
        provider=profile.provider,
        gender=profile.gender,
        description=profile.description,
        preview_url=(profile.metadata_json or {}).get("preview_url")
        if profile.metadata_json
        else None,
        is_custom=True,
      )
    )
  return voices


@router.get("", response_model=List[Voice])
async def get_voices(
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  """
  Return available voices for the current user. TTS is Cartesia only: Cartesia Sonic voices plus custom clones.
  """
  voices: list[Voice] = []

  # Cartesia Sonic voices only (used for all live and web calls)
  def _cartesia_voices() -> list[Voice]:
    return [
      Voice(id=DEFAULT_CARTESIA_VOICE_ID, name="Katie", gender="female", provider="cartesia", description="Stable, natural – recommended for agents"),
      Voice(id="228fca29-3a0a-435c-8728-5cb483251068", name="Kiefer", gender="male", provider="cartesia", description="Stable, clear"),
      Voice(id="6ccbfb76-1fc6-48f7-b71d-91ac6298247b", name="Tessa", gender="female", provider="cartesia", description="Emotive and expressive"),
      Voice(id="c961b81c-a935-4c17-bfb3-ba2239de8c2f", name="Kyle", gender="male", provider="cartesia", description="Emotive and expressive"),
    ]
  voices.extend(_cartesia_voices())

  # User-specific cloned voices (Cartesia UUIDs only are used for TTS; others fall back to default)
  custom_voices = await _get_user_voice_profiles(user, db)
  voices.extend(custom_voices)
  return voices


@router.post("/preview")
async def preview_voice(body: VoicePreviewRequest, user: User = Depends(get_current_user)):  # noqa: ARG001
  """
  Generate a short audio preview for a given voice & provider.
  Returns a streamed audio response (MP3 or WAV depending on provider).
  """

  # TTS is Cartesia only for all calls and previews
  provider = (body.provider or "cartesia").lower()
  if provider != "cartesia":
    raise HTTPException(status_code=400, detail="TTS is Cartesia only. Use provider 'cartesia'.")

  text = body.text.strip() or "Hi, I am your AI voice assistant, ready to help you on every call."
  if not settings.CARTESIA_API_KEY:
    raise HTTPException(status_code=400, detail="Cartesia API key not configured")

  voice_id = body.voice_id if _is_cartesia_voice_id(body.voice_id or "") else DEFAULT_CARTESIA_VOICE_ID

  async def cartesia_preview():
    async with httpx.AsyncClient(timeout=30) as client:
      resp = await client.post(
        "https://api.cartesia.ai/tts/bytes",
        headers={
          "Cartesia-Version": "2024-11-13",
          "X-API-Key": settings.CARTESIA_API_KEY,
          "Content-Type": "application/json",
        },
        json={
          "model_id": "sonic-3",
          "transcript": text,
          "voice": {"mode": "id", "id": voice_id},
          "output_format": {"container": "mp3", "sample_rate": 24000, "bit_rate": 128000},
        },
      )
      if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Cartesia TTS failed")
      return resp.content

  content = await cartesia_preview()
  return StreamingResponse(iter([content]), media_type="audio/mpeg")


@router.post("/clone/chatterbox")
async def clone_voice_chatterbox(
  name: str,
  file: UploadFile = File(...),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  """
  Clone a voice using the external Chatterbox TTS server.

  This is used only for offline voice profile generation when no external
  cloud TTS provider (e.g. Cartesia) is configured.
  """
  try:
    contents = await file.read()
    async with httpx.AsyncClient(timeout=60) as client:
      resp = await client.post(
        "http://54.179.190.33:5002/tts/clone",
        files={"file": (file.filename, contents, file.content_type or "audio/wav")},
        data={"name": name},
      )
    resp.raise_for_status()
    data = resp.json()
  except Exception as exc:  # noqa: BLE001
    raise HTTPException(
      status_code=502,
      detail=f"Chatterbox cloning failed: {exc}",
    ) from exc

  profile_path = data.get("profile_path") or data.get("voice_profile_path")
  provider_voice_id = data.get("voice_id") or profile_path or name

  voice_profile = VoiceProfile(
    user_id=user.id,
    provider="chatterbox",
    provider_voice_id=provider_voice_id,
    name=name,
    description="Cloned voice via Chatterbox",
    gender=None,
    metadata_json={
      "profile_path": profile_path,
      "raw_response": data,
    },
  )
  db.add(voice_profile)
  await db.commit()
  await db.refresh(voice_profile)

  return {
    "id": voice_profile.provider_voice_id,
    "name": voice_profile.name,
    "provider": voice_profile.provider,
    "gender": voice_profile.gender,
    "description": voice_profile.description,
    "is_custom": True,
  }

