import os
from pathlib import Path

os.environ.setdefault("OPENAI_TIMEOUT", "30")

# Load backend .env so DATABASE_URL, etc. are found when worker runs from any cwd
_backend_dir = Path(__file__).resolve().parent
from dotenv import load_dotenv
_load_env = _backend_dir / ".env"
if _load_env.exists():
    load_dotenv(_load_env)
else:
    load_dotenv()
# Production: load .env.production so worker gets same vars as backend
if os.environ.get("ENV") == "production":
    _prod_env = _backend_dir / ".env.production"
    if _prod_env.exists():
        load_dotenv(_prod_env)

# Configure logging early so system_settings and entrypoint logs are visible
import logging as _logging
_logging.basicConfig(level=_logging.INFO)

# Load API keys from DB (system_settings) into env so config sees them
from app.system_settings import run_load_system_settings_into_env
run_load_system_settings_into_env()

import asyncio
import json
import logging
import time
from datetime import datetime

import httpx
import redis.asyncio as aioredis

from app.config import settings as app_settings

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
redis_client = aioredis.from_url(REDIS_URL)


async def publish_event(room_id: str, event: dict) -> None:
    """Publish a live call event to Redis for SSE subscribers."""
    try:
        await redis_client.publish(f"call:{room_id}", json.dumps(event))
    except Exception as e:
        logger.warning("Failed to publish event to Redis: %s", e)
from app.prompts import get_full_system_prompt
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
)
from livekit.agents.llm import FallbackAdapter, function_tool
from livekit.agents.voice import Agent, AgentSession
from livekit.agents.voice.events import UserInputTranscribedEvent
from livekit.agents.voice import room_io as voice_room_io
from livekit.plugins import silero

logger = logging.getLogger("resona-agent")

# Log response latency (user final transcript -> agent first speech). Set to "0" or "false" to disable.
LOG_LATENCY = os.environ.get("LOG_LATENCY", "1").lower() not in ("0", "false", "no")


async def end_call(call_id: str, transcript_lines: list, duration: int):
    if not call_id:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"{os.environ.get('API_BASE_URL', 'http://localhost:8000')}/internal/calls/{call_id}/transcript",
                json={"lines": transcript_lines, "duration_seconds": duration},
                headers={"X-Internal-Secret": os.environ.get("INTERNAL_SECRET", "")},
            )
    except Exception as e:
        logger.warning(f"Failed to save transcript: {e}")


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext):
    logger.info("Agent job started room=%s", ctx.room.name)
    # Log API key presence (no values) to debug STT/LLM/TTS failures
    has_dg = bool((app_settings.DEEPGRAM_API_KEY or "").strip())
    has_groq = bool((app_settings.GROQ_API_KEY or "").strip())
    has_cart = bool((app_settings.CARTESIA_API_KEY or "").strip())
    use_modal_llm = bool((os.environ.get("MODAL_LLM_BASE_URL") or "").strip())
    logger.info("API keys present: DEEPGRAM=%s GROQ=%s CARTESIA=%s MODAL_LLM=%s", has_dg, has_groq, has_cart, use_modal_llm)
    if not has_dg:
        logger.error("DEEPGRAM_API_KEY missing. Set it in api-keys table (Supabase) and ensure DATABASE_URL is set for the worker.")
    if not use_modal_llm and not has_groq:
        logger.error("GROQ_API_KEY missing. Set it in api-keys table (Supabase), or set MODAL_LLM_BASE_URL for Modal.")
    if not has_cart:
        logger.error("CARTESIA_API_KEY missing. Set it in api-keys table (Supabase).")
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    try:
        participant = await ctx.wait_for_participant()
    except RuntimeError as e:
        if "room disconnected" in str(e).lower() or "waiting for participant" in str(e).lower():
            logger.info("Room %s ended before participant joined (user may have left): %s", ctx.room.name, e)
            return
        raise
    logger.info("Participant joined room=%s identity=%s", ctx.room.name, participant.identity)

    agent_config: dict = {}
    try:
        metadata = ctx.room.metadata
        if metadata:
            agent_config = json.loads(metadata)
    except Exception:
        agent_config = {}

    if not agent_config:
        room_name = ctx.room.name or ""
        parts = room_name.split("-")
        user_id = parts[1] if len(parts) > 1 else None

        if user_id:
            try:
                api_base = os.environ.get("API_BASE_URL", "http://localhost:8000")
                internal_secret = os.environ.get("INTERNAL_SECRET", "")
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.get(
                        f"{api_base}/internal/users/{user_id}/default-agent",
                        headers={"X-Internal-Secret": internal_secret},
                    )
                if resp.status_code == 200:
                    agent_config = resp.json()
                else:
                    agent_config = {}
            except Exception as e:
                logger.warning(f"Failed to fetch default agent config for user {user_id}: {e}")

        if not agent_config:
            agent_config = {
                "system_prompt": "You are a helpful, friendly voice assistant. Keep replies short and natural.",
                "first_message": "Hey, hi! What can I do for you?",
                "tts_voice_id": (app_settings.CARTESIA_DEFAULT_VOICE_ID or "a0e99841-438c-4a64-b679-ae501e7d6091").strip(),
                "llm_model": "Llama-3.1-8B-Instant",
                "llm_temperature": 0.5,
                "llm_max_tokens": 120,
            }

    # User's system prompt is primary; we only wrap it with real-time + human-behavior instructions
    base_system_prompt = agent_config.get(
        "system_prompt",
        "You are a helpful, friendly voice assistant. Keep replies short and conversational.",
    )
    if not (base_system_prompt or "").strip():
        base_system_prompt = "You are a helpful, friendly voice assistant. Keep replies short and natural."
    kb_content = agent_config.get("knowledge_base", "")
    if kb_content:
        base_system_prompt = (
            base_system_prompt.strip()
            + "\n\n=== KNOWLEDGE BASE ===\n"
            + kb_content
            + "\n=== END KNOWLEDGE BASE ==="
        )
    if base_system_prompt.strip().startswith("Speak exactly like a real human"):
        system_prompt = base_system_prompt
    else:
        system_prompt = get_full_system_prompt(base_system_prompt)
    # User's first message is always used when provided
    first_message = (agent_config.get("first_message") or "Hey, hi! What can I do for you?").strip()

    stt_language = agent_config.get("stt_language", "en")

    transcript_lines: list[dict] = []
    start_time = time.time()
    room_id = ctx.room.name or ""
    asyncio.ensure_future(
        publish_event(room_id, {"type": "state", "state": "listening"})
    )

    async def send_transcript(role: str, text: str):
        try:
            payload = json.dumps({"type": "transcript", "role": role, "text": text})
            await ctx.room.local_participant.publish_data(
                payload.encode(), reliable=True
            )
        except Exception as e:
            logger.warning(f"Failed to send transcript: {e}")
        # Redis for live dashboard SSE (speaker key for frontend)
        try:
            await publish_event(
                room_id,
                {
                    "type": "transcript",
                    "speaker": "user" if role == "user" else "agent",
                    "text": text,
                    "timestamp": datetime.utcnow().isoformat(),
                },
            )
        except Exception as e:
            logger.warning("Failed to publish transcript to Redis: %s", e)

    # STT — Deepgram Nova-2
    deepgram_key = (app_settings.DEEPGRAM_API_KEY or "").strip()
    if not deepgram_key:
        raise RuntimeError("DEEPGRAM_API_KEY is not configured. Cannot start agent worker.")

    from livekit.plugins import deepgram as deepgram_plugin

    stt = deepgram_plugin.STT(
        api_key=deepgram_key,
        model="nova-2",
        language=stt_language or "en",
        smart_format=False,
        interim_results=True,
        endpointing_ms=120,
    )
    logger.info("STT: Deepgram (nova-2, language=%s, smart_format=False, endpointing_ms=120)", stt_language or "en")

    # LLM — Modal (Llama-3.1-8B-Instant) or Groq (OpenAI-compatible)
    from livekit.plugins import openai as openai_plugin

    modal_base_url = (os.environ.get("MODAL_LLM_BASE_URL") or "").strip().rstrip("/")
    use_modal = bool(modal_base_url)

    if use_modal:
        # Modal OpenAI-compatible endpoint (e.g. vLLM on Modal serving Llama-3.1-8B-Instant)
        _raw_llm_model = (agent_config.get("llm_model") or "Llama-3.1-8B-Instant").strip()
        llm_model = _raw_llm_model or "Llama-3.1-8B-Instant"
        llm_temperature = max(0.5, min(1.0, float(agent_config.get("llm_temperature", 0.8))))
        llm_max_tokens = max(1, min(150, int(agent_config.get("llm_max_tokens", 150))))
        modal_api_key = (os.environ.get("MODAL_API_KEY") or "not-needed").strip()
        llm_kw = {
            "model": llm_model,
            "api_key": modal_api_key,
            "base_url": modal_base_url,
            "temperature": llm_temperature,
            "max_completion_tokens": llm_max_tokens,
        }
        try:
            timeout_sec = float(os.environ.get("OPENAI_TIMEOUT", "30"))
            if timeout_sec > 0:
                llm_kw["timeout"] = httpx.Timeout(timeout_sec)
        except (TypeError, ValueError):
            pass
        llm = openai_plugin.LLM(**llm_kw)
        logger.info("LLM: Modal Llama-3.1-8B-Instant (%s, temp=%.2f, max_tokens=%d)", llm_model, llm_temperature, llm_max_tokens)
    else:
        groq_key = (app_settings.GROQ_API_KEY or "").strip()
        if not groq_key:
            raise RuntimeError("GROQ_API_KEY is required for the LLM when not using Modal. Set it in DB (api-keys) or set MODAL_LLM_BASE_URL for Modal.")

        _raw_llm_model = (agent_config.get("llm_model") or "llama-3.1-8b-instant").strip()
        GROQ_DEFAULT_MODEL = "llama-3.1-8b-instant"
        # Always use 8b-instant; never use 70b/versatile (quota and rate limits)
        if (
            _raw_llm_model.startswith("gpt-")
            or _raw_llm_model.startswith("o1-")
            or "70b" in _raw_llm_model.lower()
            or "versatile" in _raw_llm_model.lower()
        ):
            llm_model = GROQ_DEFAULT_MODEL
            logger.info("LLM: agent model %s -> using %s", _raw_llm_model, llm_model)
        else:
            llm_model = _raw_llm_model or GROQ_DEFAULT_MODEL

        llm_temperature = float(agent_config.get("llm_temperature", 0.8))
        llm_max_tokens = int(agent_config.get("llm_max_tokens", 150))
        llm_temperature = max(0.5, min(1.0, llm_temperature))
        llm_max_tokens = max(1, min(150, llm_max_tokens))

        llm_kw = {
            "model": llm_model,
            "api_key": groq_key,
            "base_url": "https://api.groq.com/openai/v1",
            "temperature": llm_temperature,
            "max_completion_tokens": llm_max_tokens,
        }
        try:
            timeout_sec = float(os.environ.get("OPENAI_TIMEOUT", "30"))
            if timeout_sec > 0:
                llm_kw["timeout"] = httpx.Timeout(timeout_sec)
        except (TypeError, ValueError):
            pass
        llm = openai_plugin.LLM(**llm_kw)
        logger.info("LLM: Groq (%s, temp=%.2f, max_tokens=%d)", llm_model, llm_temperature, llm_max_tokens)

    # TTS — Cartesia Sonic-3 (streaming; language from agent for Arabic, etc.)
    cartesia_key = (app_settings.CARTESIA_API_KEY or "").strip()
    if not cartesia_key:
        raise RuntimeError("CARTESIA_API_KEY is not configured. Cannot start agent worker.")

    from livekit.plugins import cartesia as cartesia_plugin

    # Dynamic language: agent's stt_language (or tts_language if set) so user can select e.g. Arabic.
    # Normalize locale codes (en-US, ar-SA) to short code (en, ar) for Cartesia Sonic-3.
    _lang_raw = (agent_config.get("tts_language") or agent_config.get("stt_language") or "en").strip() or "en"
    tts_language = _lang_raw.split("-")[0] if _lang_raw else "en"

    # Cartesia expects UUID-format voice IDs. If agent has non-UUID (e.g. ElevenLabs), use default.
    _raw_voice = (agent_config.get("tts_voice_id") or "").strip()
    _cartesia_default = (app_settings.CARTESIA_DEFAULT_VOICE_ID or "").strip() or "a0e99841-438c-4a64-b679-ae501e7d6091"
    if _raw_voice and "-" in _raw_voice and len(_raw_voice) == 36:
        tts_voice_id = _raw_voice
    else:
        tts_voice_id = _cartesia_default
        if _raw_voice:
            logger.info("TTS: agent tts_voice_id is not a Cartesia UUID, using default voice=%s", tts_voice_id)
    tts = cartesia_plugin.TTS(
        api_key=cartesia_key,
        model="sonic-3",
        voice=tts_voice_id,
        language=tts_language,
    )
    logger.info("TTS: Cartesia (sonic-3, voice=%s, language=%s)", tts_voice_id, tts_language)

    # AgentSession — use TurnHandlingConfig if available, else standard kwargs
    _session_kw: dict = {
        "vad": ctx.proc.userdata["vad"],
        "stt": stt,
        "llm": llm,
        "tts": tts,
        "turn_detection": "vad",
        "preemptive_generation": True,
    }
    # Fast turn-taking: tighter endpointing = lower latency; allow barge-in
    _min_ep = float(os.environ.get("MIN_ENDPOINTING_DELAY", "0.02"))
    _max_ep = float(os.environ.get("MAX_ENDPOINTING_DELAY", "0.25"))
    try:
        from livekit.agents.voice import TurnHandlingConfig

        _session_kw["turn_handling"] = TurnHandlingConfig(
            min_endpointing_delay=_min_ep,
            max_endpointing_delay=_max_ep,
            allow_interruptions=True,
            min_interruption_duration=0.2,
            min_interruption_words=2,
        )
    except ImportError:
        _session_kw["allow_interruptions"] = True
        _session_kw["min_endpointing_delay"] = _min_ep
        _session_kw["max_endpointing_delay"] = _max_ep
        _session_kw["min_interruption_duration"] = 0.2
        _session_kw["min_interruption_words"] = 2
    logger.info("Turn handling: min_endpointing=%.2fs max_endpointing=%.2fs", _min_ep, _max_ep)

    # Add optional params only if AgentSession accepts them
    try:
        from inspect import signature

        sig = signature(AgentSession.__init__)
        if "use_remote_turn_detector" in sig.parameters:
            _session_kw["use_remote_turn_detector"] = False
        if "aec_warmup_duration" in sig.parameters:
            _session_kw["aec_warmup_duration"] = 0
        if "false_interruption_timeout" in sig.parameters:
            _session_kw["false_interruption_timeout"] = None
        if "resume_false_interruption" in sig.parameters:
            _session_kw["resume_false_interruption"] = False
    except Exception:
        pass

    session = AgentSession(**_session_kw)

    # Per-room latency tracking (user final transcript -> agent first speech)
    user_final_at: float | None = None

    @session.on("user_input_transcribed")
    def on_user_transcript(event: UserInputTranscribedEvent):
        nonlocal user_final_at
        if event.is_final and event.transcript.strip():
            text = event.transcript.strip()
            user_final_at = time.perf_counter()
            if LOG_LATENCY:
                logger.info("[latency] user_final_transcript room=%s: %s", room_id, text[:60])
            logger.info("User: %s", text)
            transcript_lines.append(
                {
                    "role": "user",
                    "text": text,
                    "timestamp": datetime.utcnow().isoformat(),
                }
            )
            asyncio.ensure_future(send_transcript("user", text))
            asyncio.ensure_future(
                publish_event(room_id, {"type": "state", "state": "thinking"})
            )

    @session.on("agent_speech_committed")
    def on_agent_speech(text: str):
        nonlocal user_final_at
        if text and text.strip():
            cleaned = text.strip()
            if LOG_LATENCY and user_final_at is not None:
                latency_ms = (time.perf_counter() - user_final_at) * 1000
                logger.info("[latency] agent_speech_committed room=%s response_latency_ms=%.0f text=%s", room_id, latency_ms, cleaned[:60])
            logger.info("Agent: %s", cleaned)
            transcript_lines.append(
                {
                    "role": "agent",
                    "text": cleaned,
                    "timestamp": datetime.utcnow().isoformat(),
                }
            )
            asyncio.ensure_future(send_transcript("agent", cleaned))
            asyncio.ensure_future(
                publish_event(room_id, {"type": "state", "state": "speaking"})
            )

    @session.on("session_stopped")
    def on_session_stopped():
        duration = int(time.time() - start_time)
        asyncio.ensure_future(
            end_call(
                agent_config.get("call_id", ""),
                transcript_lines,
                duration,
            )
        )

    transfer_number = (agent_config.get("transfer_number") or "").strip()

    def make_transfer_tool(room, configured_transfer_number: str):
        @function_tool
        async def transfer_call(transfer_to: str) -> str:
            """Transfer the current call to a human agent or another number.
            Use this when the user asks to speak to a human, or when you cannot help them.
            transfer_to: the phone number or department to transfer to.
            """
            if not configured_transfer_number:
                return "Transfer is currently unavailable."
            try:
                await publish_event(
                    room_id,
                    {
                        "type": "transfer_requested",
                        "to_number": configured_transfer_number,
                        "timestamp": datetime.utcnow().isoformat(),
                    },
                )
                api_base = os.environ.get("API_BASE_URL", "http://localhost:8000")
                internal_secret = os.environ.get("INTERNAL_SECRET", "")
                async with httpx.AsyncClient(timeout=10) as client:
                    await client.post(
                        f"{api_base}/internal/live-calls/transfer",
                        json={"room_id": room_id, "to_number": configured_transfer_number},
                        headers={"X-Internal-Secret": internal_secret},
                    )
            except Exception as e:
                logger.warning("Failed to publish or execute transfer: %s", e)
                return "Transfer is currently unavailable."
            return "Transferring you now. Please hold."

        return transfer_call

    transfer_tool = make_transfer_tool(ctx.room, transfer_number)
    logger.info(
        "Starting voice session room=%s agent_speaks_first=%s",
        ctx.room.name,
        agent_config.get("agent_speaks_first", True),
    )
    room_options = voice_room_io.RoomOptions(
        audio_input=voice_room_io.AudioInputOptions(sample_rate=16000),
    )
    try:
        await session.start(
            agent=Agent(instructions=system_prompt, tools=[transfer_tool]),
            room=ctx.room,
            room_options=room_options,
        )
    except Exception as e:
        logger.exception("session.start() failed: %s", e)
        raise

    agent_speaks_first = agent_config.get("agent_speaks_first", True)
    say_text = first_message or "Hey, hi! What can I do for you?"
    if agent_speaks_first and say_text:
        try:
            await session.say(say_text, allow_interruptions=True)
            logger.info("First message sent: %s", say_text[:50] + ("..." if len(say_text) > 50 else ""))
        except Exception as e:
            logger.exception("Agent TTS/say failed: %s", e)


if __name__ == "__main__":
    _http_port = int(os.environ.get("LIVEKIT_AGENT_HTTP_PORT", "8081"))
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            port=_http_port,
        )
    )
