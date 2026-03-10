import logging
import re
from typing import List

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
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
    try:
        voices = await _fetch_elevenlabs_voices()
    except Exception as e:
        logger.exception("Failed to fetch ElevenLabs voices: %s", e)
        raise HTTPException(
            status_code=503,
            detail="ElevenLabs voices unavailable. Add keys in api-keys table.",
        ) from e
    if not voices:
        raise HTTPException(
            status_code=503,
            detail="ElevenLabs voices unavailable. Add keys in api-keys table.",
        )
    return voices


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
    # Ensure voice name is valid UTF-8; restrict to printable ASCII to avoid ElevenLabs invalid_unicode errors
    try:
        name_clean = name.encode("utf-8", errors="replace").decode("utf-8").strip() or "Voice"
        name_clean = re.sub(r"[^\x20-\x7e]", "", name_clean).strip() or "Voice"
    except Exception:
        name_clean = "Voice"
    name_bytes = name_clean.encode("utf-8")
    # Build multipart for ElevenLabs: name (explicit UTF-8) + files (ASCII filenames only)
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
        file_contents.append((safe_filename, content, f.content_type or "audio/mpeg"))
    if not file_contents:
        raise HTTPException(status_code=400, detail="At least one audio file is required.")
    last_err: Exception | None = None
    for api_key in keys:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                # Send name as UTF-8 bytes with explicit charset so multipart is valid
                parts = [("name", (None, name_bytes, "text/plain; charset=utf-8"))]
                for filename, content, ctype in file_contents:
                    parts.append(("files", (filename, content, ctype)))
                resp = await client.post(
                    f"{ELEVENLABS_API_BASE}/voices/add",
                    headers=_elevenlabs_headers(api_key),
                    files=parts,
                )
            if resp.status_code == 200:
                data = resp.json()
                voice_id = data.get("voice_id") or data.get("id")
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
