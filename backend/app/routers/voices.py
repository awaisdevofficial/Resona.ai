from typing import List

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
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
  Return available voices for the current user.
  Deepgram Aura 2 voices (always listed); plus user-specific cloned voices (e.g. Chatterbox).
  """
  voices: list[Voice] = []

  # User-specific cloned voices (e.g. Chatterbox)
  custom_voices = await _get_user_voice_profiles(user, db)

  # Deepgram Aura 2 voices (all available for TTS)
  def _deepgram_aura_voices() -> list[Voice]:
    return [
      Voice(id="aura-2-andromeda-en", name="Andromeda", gender="female", provider="deepgram", description="Warm and natural"),
      Voice(id="aura-2-athena-en", name="Athena", gender="female", provider="deepgram", description="Professional and clear"),
      Voice(id="aura-2-orion-en", name="Orion", gender="male", provider="deepgram", description="Deep and authoritative"),
      Voice(id="aura-2-stella-en", name="Stella", gender="female", provider="deepgram", description="Energetic and bright"),
      Voice(id="aura-2-hera-en", name="Hera", gender="female", provider="deepgram", description="Confident and strong"),
      Voice(id="aura-2-zeus-en", name="Zeus", gender="male", provider="deepgram", description="Powerful and commanding"),
      Voice(id="aura-2-arcas-en", name="Arcas", gender="male", provider="deepgram", description="Friendly and warm"),
      Voice(id="aura-2-perseus-en", name="Perseus", gender="male", provider="deepgram", description="Clear and professional"),
      Voice(id="aura-2-angus-en", name="Angus", gender="male", provider="deepgram", description="Casual and relaxed"),
      Voice(id="aura-2-orpheus-en", name="Orpheus", gender="male", provider="deepgram", description="Rich and smooth"),
      Voice(id="aura-2-helios-en", name="Helios", gender="male", provider="deepgram", description="Bright and upbeat"),
      Voice(id="aura-asteria-en", name="Asteria (legacy)", gender="female", provider="deepgram", description="Warm and friendly"),
      Voice(id="aura-luna-en", name="Luna (legacy)", gender="female", provider="deepgram", description="Soft and calm"),
    ]
  voices.extend(_deepgram_aura_voices())

  # Append custom cloned voices at the end
  voices.extend(custom_voices)
  return voices


@router.post("/preview")
async def preview_voice(body: VoicePreviewRequest, user: User = Depends(get_current_user)):  # noqa: ARG001
  """
  Generate a short audio preview for a given voice & provider.
  Returns a streamed audio response (MP3 or WAV depending on provider).
  """

  provider = body.provider.lower()
  text = body.text.strip() or "Hi, I am your AI voice assistant, ready to help you on every call."

  # Deepgram Aura TTS preview (MP3)
  if provider == "deepgram":
    if not settings.DEEPGRAM_API_KEY:
      raise HTTPException(status_code=400, detail="Deepgram API key not configured")

    model = body.voice_id or "aura-2-andromeda-en"
    if model == "default":
      model = "aura-2-andromeda-en"

    async def deepgram_stream():
      async with httpx.AsyncClient(timeout=30) as client:
        async with client.stream(
          "POST",
          "https://api.deepgram.com/v1/speak",
          params={"model": model},
          headers={
            "Authorization": f"Token {settings.DEEPGRAM_API_KEY}",
            "Content-Type": "application/json",
          },
          json={"text": text},
        ) as resp:
          if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Deepgram TTS failed")
          async for chunk in resp.aiter_bytes():
            yield chunk

    return StreamingResponse(deepgram_stream(), media_type="audio/mpeg")

  raise HTTPException(status_code=400, detail=f"Unsupported TTS provider: {provider}. Only Deepgram is supported.")


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

