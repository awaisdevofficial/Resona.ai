from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException
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


def _kokoro_base_url() -> str:
  """Base URL for Kokoro API including /v1 (e.g. http://host:8880/v1)."""
  url = (settings.KOKORO_TTS_URL or "").strip().rstrip("/")
  if not url or "/v1" not in url:
    return ""
  return url[: url.find("/v1") + 4]


# Fallback Kokoro voice list when /v1/voices is unavailable (id, display name, gender)
KOKORO_VOICES_FALLBACK: list[tuple[str, str, str]] = [
  ("af_heart", "Heart", "female"),
  ("af_bella", "Bella", "female"),
  ("af_nova", "Nova", "female"),
  ("af_sarah", "Sarah", "female"),
  ("am_adam", "Adam", "male"),
  ("am_echo", "Echo", "male"),
  ("am_onyx", "Onyx", "male"),
]


async def _fetch_kokoro_voices() -> list[Voice]:
  """Fetch available voices from Kokoro server (GET /v1/voices). Returns fallback list on failure."""
  base = _kokoro_base_url()
  if not base:
    return []
  try:
    async with httpx.AsyncClient(timeout=10) as client:
      resp = await client.get(f"{base}/voices")
      if resp.status_code != 200:
        raise ValueError(f"status {resp.status_code}")
      data = resp.json()
      items = data if isinstance(data, list) else data.get("voices") or data.get("data") or []
      if not isinstance(items, list):
        raise ValueError("voices not a list")
      out: list[Voice] = []
      for item in items:
        if isinstance(item, str):
          # e.g. "af_heart" -> name "Heart"
          name = item.replace("_", " ").title()
          if item.startswith("af_"):
            gender = "female"
          elif item.startswith("am_") or item.startswith("bm_"):
            gender = "male"
          else:
            gender = "unknown"
          out.append(Voice(id=item, name=name, provider="kokoro", gender=gender, description="Kokoro TTS"))
        elif isinstance(item, dict):
          vid = str(item.get("id") or item.get("voice_id") or item.get("name") or "")
          name = str(item.get("name") or item.get("display_name") or vid.replace("_", " ").title() or "Unknown")
          gender = item.get("gender")
          out.append(
            Voice(
              id=vid,
              name=name,
              provider="kokoro",
              gender=gender,
              description=item.get("description") or "Kokoro TTS",
            )
          )
      if out:
        return out
  except Exception:
    pass
  return [
    Voice(id=vid, name=name, gender=g, provider="kokoro", description="Kokoro TTS")
    for vid, name, g in KOKORO_VOICES_FALLBACK
  ]


def _cartesia_voices() -> list[Voice]:
  return [
    Voice(id=DEFAULT_CARTESIA_VOICE_ID, name="Katie", gender="female", provider="cartesia", description="Stable, natural – recommended for agents"),
    Voice(id="228fca29-3a0a-435c-8728-5cb483251068", name="Kiefer", gender="male", provider="cartesia", description="Stable, clear"),
    Voice(id="6ccbfb76-1fc6-48f7-b71d-91ac6298247b", name="Tessa", gender="female", provider="cartesia", description="Emotive and expressive"),
    Voice(id="c961b81c-a935-4c17-bfb3-ba2239de8c2f", name="Kyle", gender="male", provider="cartesia", description="Emotive and expressive"),
  ]


@router.get("", response_model=List[Voice])
async def get_voices(
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  """
  Return available voices: Kokoro (when KOKORO_TTS_URL set) and Cartesia (when CARTESIA_API_KEY set).
  """
  voices: list[Voice] = []
  kokoro_url = (settings.KOKORO_TTS_URL or "").strip()
  use_kokoro = bool(kokoro_url)

  if use_kokoro:
    kokoro_list = await _fetch_kokoro_voices()
    voices.extend(kokoro_list)

  if settings.CARTESIA_API_KEY:
    voices.extend(_cartesia_voices())

  custom_voices = await _get_user_voice_profiles(user, db)
  for v in custom_voices:
    if (v.provider or "").lower() != "deepgram":
      voices.append(v)

  # Exclude Deepgram from list when using self-hosted TTS
  if use_kokoro:
    voices = [v for v in voices if (v.provider or "").lower() != "deepgram"]

  return voices


@router.post("/preview")
async def preview_voice(body: VoicePreviewRequest, user: User = Depends(get_current_user)):  # noqa: ARG001
  """
  Generate a short audio preview for a given voice & provider.
  Supports provider: kokoro or cartesia only.
  """
  provider = (body.provider or "").lower() or "kokoro"
  text = body.text.strip() or "Hi, I am your AI voice assistant, ready to help you on every call."

  if provider == "kokoro":
    kokoro_base = _kokoro_base_url()
    if not kokoro_base:
      raise HTTPException(status_code=400, detail="Kokoro TTS not configured (set KOKORO_TTS_URL)")
    voice = (body.voice_id or "").strip() or (settings.KOKORO_TTS_VOICE or "af_heart").strip()
    model = (settings.KOKORO_TTS_MODEL or "tts-1").strip()
    async with httpx.AsyncClient(timeout=30) as client:
      resp = await client.post(
        f"{kokoro_base}/audio/speech",
        headers={"Content-Type": "application/json", "Authorization": "Bearer sk-self-hosted"},
        json={"model": model, "voice": voice, "input": text},
      )
    if resp.status_code != 200:
      raise HTTPException(status_code=502, detail="Kokoro TTS preview failed")
    return StreamingResponse(iter([resp.content]), media_type="audio/mpeg")

  if provider == "cartesia":
    if not settings.CARTESIA_API_KEY:
      raise HTTPException(status_code=400, detail="Cartesia API key not configured")
    voice_id = body.voice_id if _is_cartesia_voice_id(body.voice_id or "") else DEFAULT_CARTESIA_VOICE_ID
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
    return StreamingResponse(iter([resp.content]), media_type="audio/mpeg")

  raise HTTPException(status_code=400, detail="Use provider 'kokoro' or 'cartesia'.")
