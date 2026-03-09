import logging
from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger(__name__)
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


# Comprehensive Piper voice list (medium quality preferred). Used when Piper returns few/fails.
# See https://github.com/rhasspy/piper/blob/master/VOICES.md
PIPER_VOICES_FALLBACK = [
    # English (US)
    {"id": "en_US-amy-medium", "name": "Amy", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "female", "quality": "medium", "description": "English (US) — Female"},
    {"id": "en_US-amy-low", "name": "Amy (low)", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "female", "quality": "low", "description": "English (US) — Female"},
    {"id": "en_US-joe-medium", "name": "Joe", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "male", "quality": "medium", "description": "English (US) — Male"},
    {"id": "en_US-ryan-medium", "name": "Ryan", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "male", "quality": "medium", "description": "English (US) — Male"},
    {"id": "en_US-ryan-low", "name": "Ryan (low)", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "male", "quality": "low", "description": "English (US) — Male"},
    {"id": "en_US-ryan-high", "name": "Ryan (high)", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "male", "quality": "high", "description": "English (US) — Male"},
    {"id": "en_US-bryce-medium", "name": "Bryce", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "male", "quality": "medium", "description": "English (US) — Male"},
    {"id": "en_US-danny-low", "name": "Danny", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "male", "quality": "low", "description": "English (US) — Male"},
    {"id": "en_US-arctic-medium", "name": "Arctic", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "neutral", "quality": "medium", "description": "English (US) — Neutral"},
    {"id": "en_US-kristin-medium", "name": "Kristin", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "female", "quality": "medium", "description": "English (US) — Female"},
    {"id": "en_US-kathleen-low", "name": "Kathleen", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "female", "quality": "low", "description": "English (US) — Female"},
    {"id": "en_US-lessac-medium", "name": "Lessac", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "male", "quality": "medium", "description": "English (US) — Male"},
    {"id": "en_US-ljspeech-medium", "name": "LJ Speech", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "female", "quality": "medium", "description": "English (US) — Female"},
    {"id": "en_US-sam-medium", "name": "Sam", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "male", "quality": "medium", "description": "English (US) — Male"},
    {"id": "en_US-norman-medium", "name": "Norman", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "male", "quality": "medium", "description": "English (US) — Male"},
    {"id": "en_US-hfc_female-medium", "name": "HFC Female", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "female", "quality": "medium", "description": "English (US) — Female"},
    {"id": "en_US-hfc_male-medium", "name": "HFC Male", "provider": "piper", "language": "English (US)", "language_code": "en_US", "gender": "male", "quality": "medium", "description": "English (US) — Male"},
    # English (GB)
    {"id": "en_GB-alan-medium", "name": "Alan", "provider": "piper", "language": "English (GB)", "language_code": "en_GB", "gender": "male", "quality": "medium", "description": "English (GB) — Male"},
    {"id": "en_GB-alan-low", "name": "Alan (low)", "provider": "piper", "language": "English (GB)", "language_code": "en_GB", "gender": "male", "quality": "low", "description": "English (GB) — Male"},
    {"id": "en_GB-alba-medium", "name": "Alba", "provider": "piper", "language": "English (GB)", "language_code": "en_GB", "gender": "female", "quality": "medium", "description": "English (GB) — Female"},
    {"id": "en_GB-cori-medium", "name": "Cori", "provider": "piper", "language": "English (GB)", "language_code": "en_GB", "gender": "female", "quality": "medium", "description": "English (GB) — Female"},
    {"id": "en_GB-southern_english_female-low", "name": "Southern English Female", "provider": "piper", "language": "English (GB)", "language_code": "en_GB", "gender": "female", "quality": "low", "description": "English (GB) — Female"},
    {"id": "en_GB-northern_english_male-medium", "name": "Northern English Male", "provider": "piper", "language": "English (GB)", "language_code": "en_GB", "gender": "male", "quality": "medium", "description": "English (GB) — Male"},
    # Spanish, French, German, etc.
    {"id": "es_ES-sharvard-medium", "name": "Sharvard", "provider": "piper", "language": "Spanish", "language_code": "es_ES", "gender": "male", "quality": "medium", "description": "Spanish — Male"},
    {"id": "es_ES-davefx-medium", "name": "Dave", "provider": "piper", "language": "Spanish", "language_code": "es_ES", "gender": "male", "quality": "medium", "description": "Spanish — Male"},
    {"id": "fr_FR-siwis-medium", "name": "Siwis", "provider": "piper", "language": "French", "language_code": "fr_FR", "gender": "female", "quality": "medium", "description": "French — Female"},
    {"id": "fr_FR-gilles-low", "name": "Gilles", "provider": "piper", "language": "French", "language_code": "fr_FR", "gender": "male", "quality": "low", "description": "French — Male"},
    {"id": "de_DE-thorsten-medium", "name": "Thorsten", "provider": "piper", "language": "German", "language_code": "de_DE", "gender": "male", "quality": "medium", "description": "German — Male"},
    {"id": "de_DE-kerstin-low", "name": "Kerstin", "provider": "piper", "language": "German", "language_code": "de_DE", "gender": "female", "quality": "low", "description": "German — Female"},
    {"id": "it_IT-paola-medium", "name": "Paola", "provider": "piper", "language": "Italian", "language_code": "it_IT", "gender": "female", "quality": "medium", "description": "Italian — Female"},
    {"id": "it_IT-riccardo-x_low", "name": "Riccardo", "provider": "piper", "language": "Italian", "language_code": "it_IT", "gender": "male", "quality": "x_low", "description": "Italian — Male"},
    {"id": "pt_BR-faber-medium", "name": "Faber", "provider": "piper", "language": "Portuguese (BR)", "language_code": "pt_BR", "gender": "male", "quality": "medium", "description": "Portuguese (BR) — Male"},
    {"id": "nl_NL-mls-medium", "name": "MLS Dutch", "provider": "piper", "language": "Dutch", "language_code": "nl_NL", "gender": "female", "quality": "medium", "description": "Dutch — Female"},
    {"id": "pl_PL-darkman-medium", "name": "Darkman", "provider": "piper", "language": "Polish", "language_code": "pl_PL", "gender": "male", "quality": "medium", "description": "Polish — Male"},
    {"id": "ru_RU-denis-medium", "name": "Denis", "provider": "piper", "language": "Russian", "language_code": "ru_RU", "gender": "male", "quality": "medium", "description": "Russian — Male"},
    {"id": "zh_CN-huayan-medium", "name": "Huayan", "provider": "piper", "language": "Chinese", "language_code": "zh_CN", "gender": "female", "quality": "medium", "description": "Chinese — Female"},
    {"id": "ar_JO-kareem-medium", "name": "Kareem", "provider": "piper", "language": "Arabic", "language_code": "ar_JO", "gender": "male", "quality": "medium", "description": "Arabic — Male"},
    {"id": "hi_IN-priyamvada-medium", "name": "Priyamvada", "provider": "piper", "language": "Hindi", "language_code": "hi_IN", "gender": "female", "quality": "medium", "description": "Hindi — Female"},
]


# Language display names for Piper voices (catalog may omit name_english for some).
_LANG_DISPLAY: dict[str, str] = {
    "en_US": "English (US)", "en_GB": "English (GB)",
    "es_ES": "Spanish", "es_MX": "Spanish (MX)",
    "fr_FR": "French",
    "de_DE": "German",
    "it_IT": "Italian",
    "pt_BR": "Portuguese (BR)", "pt_PT": "Portuguese (PT)",
    "ar_JO": "Arabic", "zh_CN": "Chinese", "ja_JP": "Japanese", "ko_KR": "Korean",
    "hi_IN": "Hindi", "ru_RU": "Russian", "nl_NL": "Dutch", "nl_BE": "Dutch (BE)",
    "pl_PL": "Polish", "tr_TR": "Turkish",
}


def _enrich_voice(v: dict) -> dict:
    """Ensure voice has language, language_code, gender, quality, description, provider."""
    vid = v.get("id", "")
    lang_code = (v.get("language_code") or "").strip()
    if not lang_code and vid:
        parts = vid.split("-")
        lang_code = parts[0] if parts else "en_US"
    if not lang_code:
        lang_code = "en_US"
    v["language_code"] = lang_code
    if not v.get("language") or v.get("language") == "Unknown":
        v["language"] = _LANG_DISPLAY.get(lang_code, lang_code.replace("_", " "))
    v.setdefault("provider", "piper")
    v.setdefault("gender", "neutral")
    v.setdefault("quality", "medium")
    v.setdefault("description", f"{v['language']} — {str(v.get('gender') or 'neutral').title()}")
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
    """Fetch available voices from Piper server (GET /v1/voices). Merges with fallback so we always have a full list."""
    base = _piper_base_url()
    fallback_voices = [
        Voice(**_enrich_voice(dict(v)))
        for v in PIPER_VOICES_FALLBACK
    ]
    if not base:
        logger.debug("Piper base URL not set; using fallback voice list")
        return fallback_voices
    piper_voices: list[Voice] = []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{base}/voices")
            if resp.status_code == 200:
                data = resp.json()
                for v in data if isinstance(data, list) else []:
                    raw = dict(v) if isinstance(v, dict) else {"id": str(v), "name": str(v)}
                    enriched = _enrich_voice(raw)
                    piper_voices.append(
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
            else:
                logger.warning("Piper /voices returned %s: %s", resp.status_code, resp.text[:200])
    except Exception as e:
        logger.warning("Piper voices fetch failed: %s. Merging with fallback.", e)
    # Merge: Piper voices first (server has these), then fallback voices not already present
    seen_ids: set[str] = {v.id for v in piper_voices}
    for v in fallback_voices:
        if v.id not in seen_ids:
            piper_voices.append(v)
            seen_ids.add(v.id)
    return piper_voices if piper_voices else fallback_voices


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
    url = f"{base}/audio/speech"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # strict=True so preview uses the exact voice; no fallback to another voice
            resp = await client.post(
                url,
                headers={"Content-Type": "application/json"},
                json={"model": model, "voice": voice, "input": text, "strict": True},
            )
    except httpx.ConnectError as e:
        logger.warning("Piper TTS connection failed: %s", e)
        raise HTTPException(
            status_code=502,
            detail=f"Cannot reach Piper TTS at {base}. Check PIPER_TTS_URL and that the Piper server is running.",
        ) from e
    except Exception as e:
        logger.warning("Piper TTS request failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Piper TTS error: {e!s}") from e
    if resp.status_code != 200:
        logger.warning("Piper TTS returned %s: %s", resp.status_code, resp.text[:300])
        if resp.status_code == 404:
            raise HTTPException(
                status_code=404,
                detail=f"Voice '{voice}' is not installed on the TTS server. Preview only works for voices that are installed.",
            )
        raise HTTPException(
            status_code=502,
            detail=f"Piper TTS preview failed (HTTP {resp.status_code}): {resp.text[:200] if resp.text else 'no body'}",
        )
    # Piper OpenAI-compatible API returns raw audio (WAV or MP3); prefer WAV for compatibility
    content_type = resp.headers.get("content-type", "audio/wav").split(";")[0].strip() or "audio/wav"
    return StreamingResponse(iter([resp.content]), media_type=content_type)
