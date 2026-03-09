"""
App-wide defaults: STT = Deepgram, TTS = Cartesia.
Voice IDs are provider-specific (Cartesia UUIDs vs Deepgram model names).

LiveKit server/agent-gateway may only accept "deepgram" in room metadata.
We send LIVEKIT_TTS_PROVIDER ("deepgram") in room/token metadata so the server
accepts the room; the agent worker still uses Cartesia via get_tts_provider_and_voice_id.
"""

DEFAULT_STT_PROVIDER = "deepgram"
DEFAULT_TTS_PROVIDER = "cartesia"
# Sent in LiveKit room/token metadata so server accepts the room (worker still uses Cartesia)
LIVEKIT_TTS_PROVIDER = "deepgram"

# Cartesia Sonic voices (UUIDs)
DEFAULT_CARTESIA_VOICE_ID = "f786b574-daa5-4673-aa0c-cbe3e8534c02"  # Katie – stable, recommended for agents
DEFAULT_DEEPGRAM_VOICE_ID = "aura-2-andromeda-en"


def _is_cartesia_voice_id(vid: str) -> bool:
    """Cartesia voice IDs are UUIDs (e.g. f786b574-daa5-4673-aa0c-cbe3e8534c02)."""
    if not vid or vid.startswith("aura"):
        return False
    return len(vid) == 36 and vid.count("-") == 4


def get_tts_provider_and_voice_id(tts_provider: str | None, tts_voice_id: str | None) -> tuple[str, str]:
    """Return (tts_provider, voice_id). Supports cartesia and kokoro; voice_id is provider-specific."""
    provider = (tts_provider or "").strip().lower() or DEFAULT_TTS_PROVIDER
    vid = (tts_voice_id or "").strip()
    if provider == "kokoro":
        return "kokoro", vid or "af_heart"
    # cartesia (default)
    voice_id = vid if _is_cartesia_voice_id(vid) else DEFAULT_CARTESIA_VOICE_ID
    return "cartesia", voice_id
