import logging
from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import settings
from app.system_settings import get_elevenlabs_keys_ordered

logger = logging.getLogger(__name__)
from app.middleware.auth import get_current_user
from app.models.user import User


router = APIRouter()

ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"


def _elevenlabs_headers(api_key: str) -> dict:
    if not api_key:
        return {}
    return {"xi-api-key": api_key, "Content-Type": "application/json"}


def _enrich_elevenlabs_voice(raw: dict) -> dict:
    """Map ElevenLabs voice object to our Voice schema."""
    voice_id = raw.get("voice_id") or raw.get("id", "")
    name = raw.get("name", "Unknown")
    labels = raw.get("labels") or {}
    gender = (labels.get("gender") or "neutral").lower()
    description = labels.get("description") or f"{name} — {gender}"
    return {
        "id": voice_id,
        "name": name,
        "provider": "elevenlabs",
        "gender": gender,
        "description": description,
        "preview_url": raw.get("preview_url"),
        "language": None,
        "language_code": None,
        "quality": None,
    }


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


async def _fetch_elevenlabs_voices() -> list[Voice]:
    """Fetch voices from ElevenLabs; try next api-keys row on failure."""
    keys = get_elevenlabs_keys_ordered()
    if not keys:
        logger.debug("No ELEVENLABS_API_KEY in api-keys table")
        return []
    last_err: Exception | None = None
    for api_key in keys:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{ELEVENLABS_API_BASE}/voices",
                    headers=_elevenlabs_headers(api_key),
                )
                if resp.status_code == 200:
                    data = resp.json()
                    voices_list = data.get("voices") if isinstance(data, dict) else (data if isinstance(data, list) else [])
                    return [
                        Voice(**_enrich_elevenlabs_voice(v if isinstance(v, dict) else {"voice_id": str(v), "name": str(v)}))
                        for v in voices_list
                    ]
                last_err = RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            last_err = e
            logger.debug("ElevenLabs /voices failed with key, trying next row: %s", e)
    if last_err:
        logger.warning("ElevenLabs voices fetch failed for all keys: %s", last_err)
    return []


@router.get("", response_model=List[Voice])
async def list_voices(user: User = Depends(get_current_user)):  # noqa: ARG001
    """Return ElevenLabs voices."""
    voices = await _fetch_elevenlabs_voices()
    if not voices:
        raise HTTPException(
            status_code=503,
            detail="ElevenLabs voices unavailable. Add keys in api-keys table.",
        )
    return voices


@router.post("/preview")
async def preview_voice(body: VoicePreviewRequest, user: User = Depends(get_current_user)):  # noqa: ARG001
    """Generate a short audio preview using ElevenLabs TTS."""
    provider = (body.provider or "").lower() or "elevenlabs"
    if provider != "elevenlabs":
        raise HTTPException(
            status_code=400,
            detail="Only 'elevenlabs' provider is supported.",
        )
    keys = get_elevenlabs_keys_ordered()
    if not keys:
        raise HTTPException(status_code=503, detail="ElevenLabs not configured (add keys in api-keys table)")
    text = body.text.strip() or "Hi, I am your AI voice assistant, ready to help you on every call."
    voice_id = (body.voice_id or "").strip() or (settings.ELEVENLABS_DEFAULT_VOICE_ID or "bIHbv24MWmeRgasZH58o").strip()
    model_id = (settings.ELEVENLABS_TTS_MODEL or "eleven_turbo_v2_5").strip()
    url = f"{ELEVENLABS_API_BASE}/text-to-speech/{voice_id}"
    last_err: Exception | None = None
    for api_key in keys:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    url,
                    headers=_elevenlabs_headers(api_key),
                    json={"text": text, "model_id": model_id},
                )
            if resp.status_code == 200:
                content_type = resp.headers.get("content-type", "audio/mpeg").split(";")[0].strip() or "audio/mpeg"
                return StreamingResponse(iter([resp.content]), media_type=content_type)
            if resp.status_code == 404:
                raise HTTPException(status_code=404, detail=f"Voice '{voice_id}' not found.")
            last_err = HTTPException(
                status_code=502,
                detail=f"ElevenLabs TTS failed (HTTP {resp.status_code}): {resp.text[:200] if resp.text else 'no body'}",
            )
        except HTTPException:
            raise
        except Exception as e:
            last_err = e
            logger.debug("ElevenLabs TTS failed with key, trying next row: %s", e)
    if last_err:
        raise HTTPException(status_code=502, detail=f"ElevenLabs TTS error: {last_err!s}")
    raise HTTPException(status_code=502, detail="ElevenLabs TTS failed for all keys")
