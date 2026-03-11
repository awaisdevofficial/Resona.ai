from __future__ import annotations

import logging
import re
import time
from typing import List

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import settings
from app.constants import DEFAULT_CARTESIA_VOICE_ID, SUPPORTED_LANGUAGES
from app.system_settings import get_cartesia_keys_ordered, get_elevenlabs_keys_ordered

logger = logging.getLogger(__name__)
from app.middleware.auth import get_current_user
from app.models.user import User


router = APIRouter()

ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"
CARTESIA_API_BASE = "https://api.cartesia.ai"
CARTESIA_API_VERSION = "2025-04-16"

# In-memory cache for voices list to avoid hitting providers on every request
_voices_cache: list | None = None
_voices_cache_at: float = 0
_cartesia_voices_cache: list | None = None
_cartesia_voices_cache_at: float = 0
VOICES_CACHE_TTL_SEC = 90
VOICES_HTTP_TIMEOUT = 8


def _elevenlabs_headers(api_key: str, json_content_type: bool = True) -> dict:
    if not api_key:
        return {}
    h = {"xi-api-key": api_key}
    if json_content_type:
        h["Content-Type"] = "application/json"
    return h


def _enrich_elevenlabs_voice(raw: dict) -> dict:
    """Map ElevenLabs voice object to our Voice schema."""
    voice_id = raw.get("voice_id") or raw.get("id", "")
    name = raw.get("name", "Unknown")
    labels = raw.get("labels") or {}
    if isinstance(labels, str):
        labels = {}
    gender = (labels.get("gender") or "neutral").lower()
    description = labels.get("description") or raw.get("description") or f"{name} — {gender}"
    # Use labels for language so UI does not show "Unknown"
    _lang = labels.get("language") or labels.get("accent") or raw.get("language")
    lang = (_lang or "English").strip() if _lang else "English"
    _lc = labels.get("language_code") or raw.get("language_code")
    lang_code = (_lc or "en").strip() if _lc else "en"
    is_custom = raw.get("category") == "cloned" or raw.get("category") == "generated"
    return {
        "id": voice_id,
        "name": name,
        "provider": "elevenlabs",
        "gender": gender,
        "description": description,
        "preview_url": raw.get("preview_url"),
        "language": lang if lang else "English",
        "language_code": lang_code if lang_code else "en",
        "quality": None,
        "is_custom": is_custom,
    }


def _cartesia_headers(api_key: str) -> dict:
    if not api_key:
        return {}
    return {
        "Authorization": f"Bearer {api_key}",
        "Cartesia-Version": CARTESIA_API_VERSION,
        "Content-Type": "application/json",
    }


# Cartesia Sonic-3 supported languages: code -> display name (for voice list and agent language selector)
CARTESIA_LANGUAGE_DISPLAY = {
    "en": "English", "ar": "Arabic", "bn": "Bengali", "bg": "Bulgarian", "zh": "Chinese",
    "hr": "Croatian", "cs": "Czech", "da": "Danish", "nl": "Dutch", "fi": "Finnish",
    "fr": "French", "ka": "Georgian", "de": "German", "el": "Greek", "gu": "Gujarati",
    "he": "Hebrew", "hi": "Hindi", "hu": "Hungarian", "id": "Indonesian", "it": "Italian",
    "ja": "Japanese", "kn": "Kannada", "ko": "Korean", "ml": "Malayalam", "ms": "Malay",
    "mr": "Marathi", "no": "Norwegian", "pa": "Punjabi", "pl": "Polish", "pt": "Portuguese",
    "ro": "Romanian", "ru": "Russian", "sk": "Slovak", "es": "Spanish", "sv": "Swedish",
    "tl": "Tagalog", "ta": "Tamil", "te": "Telugu", "th": "Thai", "tr": "Turkish",
    "uk": "Ukrainian", "vi": "Vietnamese",
}


def _enrich_cartesia_voice(raw: dict) -> dict:
    """Map Cartesia voice object to our Voice schema. Cartesia uses UUID id; API returns language per voice."""
    voice_id = (raw.get("id") or "").strip()
    name = (raw.get("name") or raw.get("description") or "Unknown").strip() or "Unknown"
    gender_raw = (raw.get("gender") or raw.get("gender_presentation") or "neutral").lower()
    if "feminine" in gender_raw or gender_raw == "female":
        gender = "female"
    elif "masculine" in gender_raw or gender_raw == "male":
        gender = "male"
    else:
        gender = "neutral"
    description = raw.get("description") or name
    lang_code = (raw.get("language") or "en").strip() if raw.get("language") else "en"
    lang_display = CARTESIA_LANGUAGE_DISPLAY.get(lang_code, lang_code)
    return {
        "id": voice_id,
        "name": name,
        "provider": "cartesia",
        "gender": gender,
        "description": description,
        "preview_url": raw.get("preview_url"),
        "language": lang_display,
        "language_code": lang_code,
        "quality": None,
        "is_custom": False,
    }


async def _fetch_cartesia_voices() -> list[Voice]:
    """Fetch voices from Cartesia API. Uses short-lived cache."""
    global _cartesia_voices_cache, _cartesia_voices_cache_at
    now = time.monotonic()
    if _cartesia_voices_cache is not None and (now - _cartesia_voices_cache_at) < VOICES_CACHE_TTL_SEC:
        return _cartesia_voices_cache
    keys = get_cartesia_keys_ordered()
    if not keys:
        logger.debug("No CARTESIA_API_KEY in api-keys table")
        return []
    last_err: Exception | None = None
    for api_key in keys:
        try:
            async with httpx.AsyncClient(timeout=VOICES_HTTP_TIMEOUT) as client:
                resp = await client.get(
                    f"{CARTESIA_API_BASE}/voices",
                    headers=_cartesia_headers(api_key),
                    params={"limit": 100},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    # Cartesia returns {"voices": [...]} or similar; handle both list and paginated
                    if isinstance(data, list):
                        voices_list = data
                    else:
                        voices_list = data.get("voices", data.get("data", [])) or []
                    result = [
                        Voice(**_enrich_cartesia_voice(v if isinstance(v, dict) else {"id": str(v), "name": str(v)}))
                        for v in voices_list
                    ]
                    _cartesia_voices_cache = result
                    _cartesia_voices_cache_at = time.monotonic()
                    return result
                last_err = RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            last_err = e
            logger.debug("Cartesia /voices failed with key, trying next row: %s", e)
    if last_err:
        logger.warning("Cartesia voices fetch failed for all keys: %s", last_err)
    return []


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
    """Fetch voices from ElevenLabs; try next api-keys row on failure. Uses short-lived cache."""
    global _voices_cache, _voices_cache_at
    now = time.monotonic()
    if _voices_cache is not None and (now - _voices_cache_at) < VOICES_CACHE_TTL_SEC:
        return _voices_cache
    keys = get_elevenlabs_keys_ordered()
    if not keys:
        logger.debug("No ELEVENLABS_API_KEY in api-keys table")
        return []
    last_err: Exception | None = None
    for api_key in keys:
        try:
            async with httpx.AsyncClient(timeout=VOICES_HTTP_TIMEOUT) as client:
                resp = await client.get(
                    f"{ELEVENLABS_API_BASE}/voices",
                    headers=_elevenlabs_headers(api_key),
                )
                if resp.status_code == 200:
                    data = resp.json()
                    voices_list = data.get("voices") if isinstance(data, dict) else (data if isinstance(data, list) else [])
                    result = [
                        Voice(**_enrich_elevenlabs_voice(v if isinstance(v, dict) else {"voice_id": str(v), "name": str(v)}))
                        for v in voices_list
                    ]
                    _voices_cache = result
                    _voices_cache_at = time.monotonic()
                    return result
                last_err = RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            last_err = e
            logger.debug("ElevenLabs /voices failed with key, trying next row: %s", e)
    if last_err:
        logger.warning("ElevenLabs voices fetch failed for all keys: %s", last_err)
    return []


@router.get("/languages")
async def list_supported_languages(user: User = Depends(get_current_user)):  # noqa: ARG001
    """Return supported STT/TTS language codes and display names (e.g. for agent language selector)."""
    return [{"code": code, "name": name} for code, name in SUPPORTED_LANGUAGES]


@router.get("", response_model=List[Voice])
async def list_voices(user: User = Depends(get_current_user)):  # noqa: ARG001
    """Return voices from Cartesia and ElevenLabs (Cartesia first for default stack)."""
    all_voices: list[Voice] = []
    try:
        cartesia = await _fetch_cartesia_voices()
        all_voices.extend(cartesia)
    except Exception as e:
        logger.warning("Cartesia voices fetch failed: %s", e)
    try:
        elevenlabs = await _fetch_elevenlabs_voices()
        all_voices.extend(elevenlabs)
    except Exception as e:
        logger.warning("ElevenLabs voices fetch failed: %s", e)
    if not all_voices:
        raise HTTPException(
            status_code=503,
            detail="No voices available. Add Cartesia or ElevenLabs API key in Settings → API Keys.",
        )
    return all_voices


@router.post("/add")
async def add_voice_clone(
    name: str = Form(..., min_length=1, max_length=100),
    files: List[UploadFile] = File(..., min_length=1),
    user: User = Depends(get_current_user),  # noqa: ARG001
):
    """
    Create a cloned voice via ElevenLabs (instant voice cloning).
    Upload one or more audio files and a name; the new voice appears in the voice library.
    """
    keys = get_elevenlabs_keys_ordered()
    if not keys:
        raise HTTPException(status_code=503, detail="Add an ElevenLabs API key in Settings → API Keys.")
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Voice name is required.")
    # Restrict to ASCII-only so ElevenLabs never sees invalid UTF-8 (name, filename, content-type)
    try:
        name_clean = name.encode("utf-8", errors="replace").decode("utf-8").strip() or "Voice"
        name_clean = re.sub(r"[^\x20-\x7e]", "", name_clean).strip() or "Voice"
    except Exception:
        name_clean = "Voice"
    # Build multipart: name (ASCII str) + files with ASCII filename and fixed content-type only
    file_contents = []
    for i, f in enumerate(files):
        content = await f.read()
        if len(content) < 1000:
            raise HTTPException(status_code=400, detail="Audio file too short; use at least a few seconds of clear speech.")
        ext = "mp3"
        if f.filename and "." in f.filename:
            ext = f.filename.rsplit(".", 1)[-1].lower() or "mp3"
        if ext not in ("mp3", "wav", "m4a", "ogg", "flac", "webm"):
            ext = "mp3"
        safe_filename = f"audio_{i + 1}.{ext}"
        # Use fixed ASCII content-type; do not forward client Content-Type (can cause invalid_unicode)
        file_contents.append((safe_filename, content, "application/octet-stream"))
    if not file_contents:
        raise HTTPException(status_code=400, detail="At least one audio file is required.")
    last_err: Exception | None = None
    for api_key in keys:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                parts = [("name", (None, name_clean))]
                for filename, content, _ in file_contents:
                    parts.append(("files", (filename, content, "application/octet-stream")))
                resp = await client.post(
                    f"{ELEVENLABS_API_BASE}/voices/add",
                    headers=_elevenlabs_headers(api_key, json_content_type=False),
                    files=parts,
                )
            if resp.status_code == 200:
                data = resp.json()
                voice_id = data.get("voice_id") or data.get("id")
                # Invalidate voices cache so new clone appears in list
                global _voices_cache
                _voices_cache = None
                if voice_id:
                    return {"voice_id": voice_id, "name": name_clean, "message": "Voice clone created. It will appear in the library."}
                return {"voice_id": None, "name": name_clean, "message": "Voice clone created."}
            last_err = HTTPException(
                status_code=min(resp.status_code, 502),
                detail=resp.text[:300] if resp.text else "ElevenLabs failed to create voice.",
            )
        except HTTPException:
            raise
        except Exception as e:
            last_err = e
            logger.debug("ElevenLabs /voices/add failed with key: %s", e)
    if last_err:
        raise HTTPException(status_code=502, detail=f"Voice cloning failed: {last_err!s}")
    raise HTTPException(status_code=502, detail="Voice cloning failed.")


@router.post("/preview")
async def preview_voice(body: VoicePreviewRequest, user: User = Depends(get_current_user)):  # noqa: ARG001
    """Generate a short audio preview using Cartesia or ElevenLabs TTS."""
    provider = (body.provider or "").lower() or "cartesia"
    text = body.text.strip() or "Hi, I am your AI voice assistant, ready to help you on every call."

    if provider == "cartesia":
        keys = get_cartesia_keys_ordered()
        if not keys:
            raise HTTPException(status_code=503, detail="Cartesia not configured (add CARTESIA_API_KEY in API Keys)")
        voice_id = (body.voice_id or "").strip() or (getattr(settings, "CARTESIA_DEFAULT_VOICE_ID", None) or DEFAULT_CARTESIA_VOICE_ID or "").strip()
        if not voice_id or "-" not in voice_id:
            voice_id = DEFAULT_CARTESIA_VOICE_ID
        last_err: Exception | None = None
        for api_key in keys:
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.post(
                        f"{CARTESIA_API_BASE}/tts/bytes",
                        headers=_cartesia_headers(api_key),
                        json={
                            "model_id": "sonic-3",
                            "transcript": text,
                            "voice": {"mode": "id", "id": voice_id},
                            "output_format": {"container": "wav", "encoding": "pcm_s16le", "sample_rate": 44100},
                        },
                    )
                if resp.status_code == 200:
                    return StreamingResponse(iter([resp.content]), media_type="audio/wav")
                if resp.status_code == 404:
                    raise HTTPException(status_code=404, detail=f"Voice '{voice_id}' not found.")
                last_err = HTTPException(
                    status_code=min(resp.status_code, 502),
                    detail=resp.text[:200] if resp.text else "Cartesia TTS failed",
                )
            except HTTPException:
                raise
            except Exception as e:
                last_err = e
                logger.debug("Cartesia TTS failed with key: %s", e)
        if last_err:
            raise HTTPException(status_code=502, detail=f"Cartesia TTS error: {last_err!s}")
        raise HTTPException(status_code=502, detail="Cartesia TTS failed for all keys")

    if provider == "elevenlabs":
        keys = get_elevenlabs_keys_ordered()
        if not keys:
            raise HTTPException(status_code=503, detail="ElevenLabs not configured (add keys in api-keys table)")
        voice_id = (body.voice_id or "").strip() or (settings.ELEVENLABS_DEFAULT_VOICE_ID or "bIHbv24MWmeRgasZH58o").strip()
        model_id = (settings.ELEVENLABS_TTS_MODEL or "eleven_turbo_v2_5").strip()
        url = f"{ELEVENLABS_API_BASE}/text-to-speech/{voice_id}"
        last_err = None
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

    raise HTTPException(status_code=400, detail="Provider must be 'cartesia' or 'elevenlabs'.")
