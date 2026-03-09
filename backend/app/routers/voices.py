from typing import Any, List

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.constants import DEFAULT_CARTESIA_VOICE_ID, DEFAULT_PIPER_VOICE, _is_cartesia_voice_id
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.models.voice_profile import VoiceProfile


router = APIRouter()


def _piper_base_url() -> str:
    """Derive Piper TTS base URL from PIPER_TTS_URL (strip /v1/audio/speech or /audio/speech)."""
    base = (settings.PIPER_TTS_URL or "").strip().rstrip("/")
    if not base:
        return ""
    for suffix in ["/v1/audio/speech", "/audio/speech"]:
        if base.endswith(suffix):
            base = base[: -len(suffix)].rstrip("/")
            break
    return base


PIPER_FALLBACK_VOICES: List[dict[str, Any]] = [
    {"id": "en_US-amy-medium", "name": "Amy", "provider": "piper", "language": "English", "language_code": "en_US", "gender": "female", "quality": "medium", "description": "English — Female"},
    {"id": "en_US-joe-medium", "name": "Joe", "provider": "piper", "language": "English", "language_code": "en_US", "gender": "male", "quality": "medium", "description": "English — Male"},
    {"id": "en_US-ryan-medium", "name": "Ryan", "provider": "piper", "language": "English", "language_code": "en_US", "gender": "male", "quality": "medium", "description": "English — Male"},
]


async def fetch_piper_voices() -> List[dict[str, Any]]:
    """Fetch available voices from Piper TTS server (GET /v1/voices). Returns fallback on failure."""
    base = _piper_base_url()
    if not base:
        return []
    url = f"{base}/v1/voices"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list):
                    return data
                return []
    except Exception:
        pass
    return PIPER_FALLBACK_VOICES


class Voice(BaseModel):
    id: str
    name: str
    provider: str
    gender: str | None = None
    description: str | None = None
    preview_url: str | None = None
    is_custom: bool = False
    language: str | None = None
    language_code: str | None = None
    country: str | None = None
    quality: str | None = None


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
                preview_url=(profile.metadata_json or {}).get("preview_url") if profile.metadata_json else None,
                is_custom=True,
                language="Unknown",
                language_code="",
            )
        )
    return voices


def _cartesia_voices() -> list[Voice]:
    return [
        Voice(id=DEFAULT_CARTESIA_VOICE_ID, name="Katie", gender="female", provider="cartesia", description="Stable, natural – recommended for agents", language="English", language_code="en"),
        Voice(id="228fca29-3a0a-435c-8728-5cb483251068", name="Kiefer", gender="male", provider="cartesia", description="Stable, clear", language="English", language_code="en"),
        Voice(id="6ccbfb76-1fc6-48f7-b71d-91ac6298247b", name="Tessa", gender="female", provider="cartesia", description="Emotive and expressive", language="English", language_code="en"),
        Voice(id="c961b81c-a935-4c17-bfb3-ba2239de8c2f", name="Kyle", gender="male", provider="cartesia", description="Emotive and expressive", language="English", language_code="en"),
    ]


def _piper_voice_to_voice(item: dict[str, Any]) -> Voice:
    """Convert Piper API voice dict to our Voice model."""
    return Voice(
        id=item.get("id", ""),
        name=item.get("name", ""),
        provider=item.get("provider", "piper"),
        gender=item.get("gender"),
        description=item.get("description"),
        language=item.get("language"),
        language_code=item.get("language_code"),
        country=item.get("country"),
        quality=item.get("quality"),
    )


@router.get("", response_model=List[Voice])
async def get_voices(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return available voices: Piper (from PIPER_TTS_URL), Cartesia (when CARTESIA_API_KEY set), and custom profiles.
    """
    voices: list[Voice] = []
    base = _piper_base_url()

    if base:
        piper_list = await fetch_piper_voices()
        for item in piper_list:
            if isinstance(item, dict):
                voices.append(_piper_voice_to_voice(item))
            else:
                voices.append(Voice(id=str(item), name=str(item), provider="piper"))

    if settings.CARTESIA_API_KEY:
        voices.extend(_cartesia_voices())

    custom_voices = await _get_user_voice_profiles(user, db)
    for v in custom_voices:
        if (v.provider or "").lower() != "deepgram":
            voices.append(v)

    if base:
        voices = [v for v in voices if (v.provider or "").lower() != "deepgram"]

    return voices


def _tts_speech_url() -> str:
    """Full URL for Piper TTS synthesis (POST)."""
    base = _piper_base_url()
    if not base:
        return ""
    return f"{base}/v1/audio/speech"


@router.post("/preview")
async def preview_voice(body: VoicePreviewRequest, user: User = Depends(get_current_user)):  # noqa: ARG001
    """
    Generate a short audio preview. For provider piper or kokoro: calls PIPER_TTS_URL with model, input, voice; returns audio/wav.
    Cartesia only when CARTESIA_API_KEY is set and provider is cartesia.
    """
    provider = (body.provider or "").strip().lower()
    text = (body.text or "").strip() or "Hi, I am your AI voice assistant, ready to help you on every call."
    voice_id = (body.voice_id or "").strip() or DEFAULT_PIPER_VOICE
    tts_url = _tts_speech_url()
    use_piper = provider in ("piper", "kokoro") or (not provider and bool(tts_url))

    if use_piper:
        if not tts_url:
            raise HTTPException(
                status_code=503,
                detail="Piper TTS not configured. Set PIPER_TTS_URL for voice preview.",
            )
        payload = {
            "model": (settings.PIPER_TTS_MODEL or "tts-1").strip(),
            "input": text,
            "voice": voice_id,
        }
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    tts_url,
                    headers={"Content-Type": "application/json"},
                    json=payload,
                )
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="TTS preview failed")
            return Response(content=resp.content, media_type="audio/wav")
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"TTS request failed: {e!s}") from e

    if provider == "cartesia":
        if not settings.CARTESIA_API_KEY:
            raise HTTPException(
                status_code=503,
                detail="Cartesia not configured. Set CARTESIA_API_KEY for Cartesia preview.",
            )
        vid = body.voice_id if _is_cartesia_voice_id(body.voice_id or "") else DEFAULT_CARTESIA_VOICE_ID
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
                    "voice": {"mode": "id", "id": vid},
                    "output_format": {"container": "mp3", "sample_rate": 24000, "bit_rate": 128000},
                },
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Cartesia TTS failed")
        return StreamingResponse(iter([resp.content]), media_type="audio/mpeg")

    raise HTTPException(
        status_code=503,
        detail="No TTS configured for preview. Set PIPER_TTS_URL and use provider 'piper' or 'kokoro', or set CARTESIA_API_KEY and use 'cartesia'.",
    )
