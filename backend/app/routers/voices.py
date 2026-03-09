from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import settings
from app.middleware.auth import get_current_user
from app.models.user import User


router = APIRouter()


def _piper_base_url() -> str:
    """Base URL for Piper API including /v1 (e.g. http://host:8880/v1)."""
    url = (settings.PIPER_TTS_URL or "").strip().rstrip("/")
    if not url:
        return ""
    for suffix in ["/v1/audio/speech", "/audio/speech"]:
        if url.endswith(suffix):
            url = url[: -len(suffix)].rstrip("/")
            break
    return url + "/v1" if not url.endswith("/v1") else url


PIPER_VOICES_FALLBACK = [
    {"id": "en_US-amy-medium", "name": "Amy", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "female", "quality": "medium", "description": "English (US) — Female"},
    {"id": "en_US-joe-medium", "name": "Joe", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "male", "quality": "medium", "description": "English (US) — Male"},
    {"id": "en_US-ryan-medium", "name": "Ryan", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "male", "quality": "medium", "description": "English (US) — Male"},
    {"id": "en_GB-alan-medium", "name": "Alan", "provider": "piper", "language": "English (GB)", "language_code": "en_GB", "gender": "male", "quality": "medium", "description": "English (GB) — Male"},
]


def _enrich_voice(v: dict) -> dict:
    """Ensure voice has language, language_code, gender, quality, description, provider."""
    vid = v.get("id", "")
    if not v.get("language"):
        parts = vid.split("-")
        lang_code = parts[0] if parts else "en_US"
        lang_map = {
            "en_US": "English (US)",
            "en_GB": "English (GB)",
            "es_ES": "Spanish",
            "fr_FR": "French",
            "de_DE": "German",
            "it_IT": "Italian",
            "pt_BR": "Portuguese",
            "ar_JO": "Arabic",
            "zh_CN": "Chinese",
            "ja_JP": "Japanese",
        }
        v["language"] = lang_map.get(lang_code, lang_code)
        v["language_code"] = lang_code
    v.setdefault("provider", "piper")
    v.setdefault("gender", "neutral")
    v.setdefault("quality", "medium")
    v.setdefault("description", f"{v['language']} — {v.get('gender', '').title()}")
    return v


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


async def _fetch_piper_voices() -> list[Voice]:
    """Fetch available voices from Piper server (GET /v1/voices). Returns fallback list on failure."""
    base = _piper_base_url()
    if base:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{base}/voices")
                if resp.status_code == 200:
                    data = resp.json()
                    voices = []
                    for v in data if isinstance(data, list) else []:
                        raw = dict(v) if isinstance(v, dict) else {"id": str(v), "name": str(v)}
                        enriched = _enrich_voice(raw)
                        voices.append(
                            Voice(
                                id=enriched.get("id", ""),
                                name=enriched.get("name", ""),
                                provider=enriched.get("provider", "piper"),
                                gender=enriched.get("gender"),
                                description=enriched.get("description"),
                                language=enriched.get("language"),
                                language_code=enriched.get("language_code"),
                                quality=enriched.get("quality"),
                            )
                        )
                    if voices:
                        return voices
        except Exception:
            pass
    return [
        Voice(**_enrich_voice(dict(v)))
        for v in PIPER_VOICES_FALLBACK
    ]


@router.get("", response_model=List[Voice])
async def list_voices(user: User = Depends(get_current_user)):  # noqa: ARG001
    """Return Piper voices only. No Cartesia or Deepgram."""
    voices = await _fetch_piper_voices()
    if not voices:
        raise HTTPException(
            status_code=503,
            detail="Piper TTS server is unavailable. Check PIPER_TTS_URL.",
        )
    return voices


@router.post("/preview")
async def preview_voice(body: VoicePreviewRequest, user: User = Depends(get_current_user)):  # noqa: ARG001
    """Generate a short audio preview. Only Piper is supported."""
    provider = (body.provider or "").lower() or "piper"
    if provider not in ("piper", "kokoro"):
        raise HTTPException(
            status_code=400,
            detail="Only 'piper' provider is supported. Cartesia and Deepgram are not configured.",
        )
    text = body.text.strip() or "Hi, I am your AI voice assistant, ready to help you on every call."
    base = _piper_base_url()
    if not base:
        raise HTTPException(status_code=503, detail="Piper TTS not configured (set PIPER_TTS_URL)")
    voice = (body.voice_id or "").strip() or (settings.PIPER_TTS_VOICE or "en_US-amy-medium").strip()
    model = (settings.PIPER_TTS_MODEL or "tts-1").strip()
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{base}/audio/speech",
            headers={"Content-Type": "application/json"},
            json={"model": model, "voice": voice, "input": text},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Piper TTS preview failed: {resp.text}")
    return StreamingResponse(iter([resp.content]), media_type="audio/wav")
