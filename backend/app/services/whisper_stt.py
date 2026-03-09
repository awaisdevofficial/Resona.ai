"""
Whisper STT service: self-hosted Faster-Whisper (OpenAI-compatible transcriptions).
Uses WHISPER_STT_URL from config.
"""
import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def _whisper_base_url() -> str:
    """Full URL for transcriptions (e.g. http://host:8000/v1/audio/transcriptions)."""
    return (settings.WHISPER_STT_URL or "").strip().rstrip("/")


async def transcribe_audio(
    audio_bytes: bytes,
    language: Optional[str] = None,
    filename: Optional[str] = None,
) -> str:
    """
    Transcribe audio using self-hosted Whisper (OpenAI-compatible API).
    Returns the transcribed text. On failure logs and returns empty string or raises.
    """
    url = _whisper_base_url()
    if not url:
        logger.warning("WHISPER_STT_URL not set; cannot transcribe")
        return ""

    # OpenAI-compatible: multipart/form-data with "file" and optional "language"
    files = {"file": (filename or "audio.wav", audio_bytes, "audio/wav")}
    data: dict = {}
    if language:
        data["language"] = language

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, files=files, data=data or None)
            resp.raise_for_status()
            result = resp.json()
            # OpenAI format: {"text": "...", "language": "en", "language_probability": 0.99}
            return (result.get("text") or "").strip()
    except httpx.HTTPStatusError as e:
        logger.exception("Whisper STT HTTP error: %s %s", e.response.status_code, e.response.text)
        raise
    except Exception as e:
        logger.exception("Whisper STT request failed: %s", e)
        raise
