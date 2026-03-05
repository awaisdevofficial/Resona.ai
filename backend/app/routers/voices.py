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

  Priority:
  - Cartesia voices if CARTESIA_API_KEY is configured
  - Otherwise default Deepgram Aura voices
  In all cases, include any user-specific cloned voices.
  """
  voices: list[Voice] = []

  # User-specific cloned voices (Cartesia / Chatterbox)
  custom_voices = await _get_user_voice_profiles(user, db)

  # Helper: build list of default Deepgram Aura voices (always available as fallback)
  def _deepgram_voices() -> list[Voice]:
    return [
      Voice(id="aura-asteria-en", name="Asteria", gender="female", provider="deepgram", description="Warm and friendly"),
      Voice(id="aura-luna-en", name="Luna", gender="female", provider="deepgram", description="Soft and calm"),
      Voice(id="aura-stella-en", name="Stella", gender="female", provider="deepgram", description="Energetic and bright"),
      Voice(id="aura-athena-en", name="Athena", gender="female", provider="deepgram", description="Professional and clear"),
      Voice(id="aura-hera-en", name="Hera", gender="female", provider="deepgram", description="Confident and strong"),
      Voice(id="aura-orion-en", name="Orion", gender="male", provider="deepgram", description="Deep and authoritative"),
      Voice(id="aura-arcas-en", name="Arcas", gender="male", provider="deepgram", description="Friendly and warm"),
      Voice(id="aura-perseus-en", name="Perseus", gender="male", provider="deepgram", description="Clear and professional"),
      Voice(id="aura-angus-en", name="Angus", gender="male", provider="deepgram", description="Casual and relaxed"),
      Voice(id="aura-orpheus-en", name="Orpheus", gender="male", provider="deepgram", description="Rich and smooth"),
      Voice(id="aura-helios-en", name="Helios", gender="male", provider="deepgram", description="Bright and upbeat"),
      Voice(id="aura-zeus-en", name="Zeus", gender="male", provider="deepgram", description="Powerful and commanding"),
    ]

  # Cartesia as primary when API key is configured
  if settings.CARTESIA_API_KEY:
    try:
      async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
          "https://api.cartesia.ai/voices",
          headers={
            "Authorization": f"Bearer {settings.CARTESIA_API_KEY}",
            "Cartesia-Version": "2024-06-10",
          },
          params={"limit": 100, "expand[]": "preview_file_url"},
        )
      resp.raise_for_status()
      data = resp.json()
      # Support both {"data": [...]} and direct list response
      raw_list = data.get("data") if isinstance(data, dict) else data
      if isinstance(raw_list, list):
        for v in raw_list:
          if not isinstance(v, dict):
            continue
          vid = v.get("id")
          if not vid:
            continue
          # Cartesia may use "gender" or "gender_presentation" (e.g. "feminine", "masculine")
          gender_val = v.get("gender") or v.get("gender_presentation")
          if isinstance(gender_val, str) and gender_val.lower() in ("feminine", "female"):
            gender_val = "female"
          elif isinstance(gender_val, str) and gender_val.lower() in ("masculine", "male"):
            gender_val = "male"
          voices.append(
            Voice(
              id=vid,
              name=v.get("name") or str(vid),
              provider="cartesia",
              gender=gender_val if isinstance(gender_val, str) else None,
              description=v.get("description"),
              preview_url=v.get("preview_file_url"),
              is_custom=False,
            )
          )
    except Exception as exc:  # noqa: BLE001
      # On any failure, fall back to Deepgram so the user always has voices
      voices.extend(_deepgram_voices())

  # Deepgram Aura defaults if Cartesia is not configured or returned empty
  if not voices:
    voices.extend(_deepgram_voices())

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

  # Cartesia preview (WAV)
  if provider == "cartesia":
    if not settings.CARTESIA_API_KEY:
      raise HTTPException(status_code=400, detail="Cartesia API key not configured")

    async def cartesia_bytes():
      async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
          "https://api.cartesia.ai/tts/bytes",
          headers={
            "Authorization": f"Bearer {settings.CARTESIA_API_KEY}",
            "Cartesia-Version": "2026-03-01",
          },
          json={
            "model_id": "sonic-3",
            "transcript": text,
            "voice": {"mode": "id", "id": body.voice_id},
            "output_format": {
              "container": "wav",
              "encoding": "pcm_s16le",
              "sample_rate": 24000,
            },
          },
        )
      if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Cartesia TTS failed")
      return resp.content

    # For Cartesia we buffer the short preview into memory
    audio_bytes = await cartesia_bytes()
    return StreamingResponse(iter((audio_bytes,)), media_type="audio/wav")

  # Deepgram Aura preview (MP3)
  if provider == "deepgram":
    if not settings.DEEPGRAM_API_KEY:
      raise HTTPException(status_code=400, detail="Deepgram API key not configured")

    model = body.voice_id or "aura-asteria-en"

    async def deepgram_stream():
      async with httpx.AsyncClient(timeout=None) as client:
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

  raise HTTPException(status_code=400, detail=f"Unsupported TTS provider: {provider}")


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


@router.post("/clone/cartesia")
async def clone_voice_cartesia(
  name: str,
  file: UploadFile = File(...),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  """
  Clone a voice using Cartesia's /voices/clone endpoint.
  """
  if not settings.CARTESIA_API_KEY:
    raise HTTPException(status_code=400, detail="Cartesia API key not configured")

  try:
    contents = await file.read()
    async with httpx.AsyncClient(timeout=60) as client:
      resp = await client.post(
        "https://api.cartesia.ai/voices/clone",
        headers={
          "Authorization": f"Bearer {settings.CARTESIA_API_KEY}",
          "Cartesia-Version": "2026-03-01",
        },
        files={"clip": (file.filename, contents, file.content_type or "audio/wav")},
        data={"name": name},
      )
    resp.raise_for_status()
    data = resp.json()
  except Exception as exc:  # noqa: BLE001
    raise HTTPException(
      status_code=502,
      detail=f"Cartesia cloning failed: {exc}",
    ) from exc

  provider_voice_id = data.get("id") or name

  voice_profile = VoiceProfile(
    user_id=user.id,
    provider="cartesia",
    provider_voice_id=provider_voice_id,
    name=data.get("name") or name,
    description=data.get("description"),
    gender=None,
    metadata_json={"raw_response": data},
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

