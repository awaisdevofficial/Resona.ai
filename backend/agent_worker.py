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

# Load API keys from DB (system_settings) into env so config sees them
from app.system_settings import run_load_system_settings_into_env
run_load_system_settings_into_env()

import asyncio
import json
import logging
import time
from datetime import datetime

import httpx

from app.config import settings as app_settings
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
logging.basicConfig(level=logging.INFO)


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
    # Log STT/TTS config (no secrets) so failures are easier to debug
    logger.info(
        "STT/TTS: ElevenLabs (model_stt=%s, model_tts=%s)",
        app_settings.ELEVENLABS_STT_MODEL or "scribe_v2_realtime",
        app_settings.ELEVENLABS_TTS_MODEL or "eleven_turbo_v2_5",
    )
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    participant = await ctx.wait_for_participant()
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
                "tts_provider": "elevenlabs",
                "tts_voice_id": app_settings.ELEVENLABS_DEFAULT_VOICE_ID or "bIHbv24MWmeRgasZH58o",
                "tts_model": app_settings.ELEVENLABS_TTS_MODEL or "eleven_turbo_v2_5",
                "stt_model": app_settings.ELEVENLABS_STT_MODEL or "scribe_v2_realtime",
                "llm_model": "gpt-4o",
                "llm_temperature": 0.8,
                "llm_max_tokens": 300,
                "tts_stability": getattr(app_settings, "ELEVENLABS_TTS_STABILITY", 0.45),
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

    stt_language = agent_config.get("stt_language", "en-US")

    transcript_lines: list[dict] = []
    start_time = time.time()

    async def send_transcript(role: str, text: str):
        try:
            payload = json.dumps({"type": "transcript", "role": role, "text": text})
            await ctx.room.local_participant.publish_data(
                payload.encode(), reliable=True
            )
        except Exception as e:
            logger.warning(f"Failed to send transcript: {e}")

    # STT — ElevenLabs Scribe (best real-time: low latency, high accuracy)
    elevenlabs_key = (app_settings.ELEVENLABS_API_KEY or "").strip()
    if not elevenlabs_key:
        raise RuntimeError("ELEVENLABS_API_KEY is not configured. Cannot start agent worker.")

    from livekit.plugins import elevenlabs as elevenlabs_plugin

    stt_model_id = (
        (agent_config.get("stt_model") or "").strip()
        or app_settings.ELEVENLABS_STT_MODEL
        or "scribe_v2_realtime"
    )
    stt = elevenlabs_plugin.STT(
        api_key=elevenlabs_key,
        model_id=stt_model_id,
        language_code=(stt_language or "en").split("-")[0],
    )
    logger.info("STT: ElevenLabs (%s)", stt_model_id)

    # LLM — OpenAI; use agent config for model/temperature/max_tokens (more human, real-time)
    from livekit.plugins import openai as openai_plugin

    openai_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not openai_key:
        raise RuntimeError("OPENAI_API_KEY is required for the LLM. Set it in DB (system_settings) or environment.")

    # LLM — gpt-4o best for fast, natural voice; fallback to config/env
    llm_model = (agent_config.get("llm_model") or "gpt-4o").strip()
    llm_temperature = float(agent_config.get("llm_temperature", 0.8))
    llm_max_tokens = int(agent_config.get("llm_max_tokens", 300))
    llm_temperature = max(0.5, min(1.0, llm_temperature))
    llm_max_tokens = max(100, min(800, llm_max_tokens))

    llm_kw: dict = {
        "model": llm_model,
        "api_key": openai_key,
        "temperature": llm_temperature,
        "max_completion_tokens": llm_max_tokens,
    }
    try:
        timeout_sec = float(os.environ.get("OPENAI_TIMEOUT", "30"))
        if timeout_sec > 0:
            import httpx
            llm_kw["timeout"] = httpx.Timeout(timeout_sec)
    except (TypeError, ValueError):
        pass
    llm = openai_plugin.LLM(**llm_kw)
    logger.info("LLM: OpenAI (%s, temp=%.2f, max_tokens=%d)", llm_model, llm_temperature, llm_max_tokens)

    # TTS — eleven_turbo_v2_5: best latency for real-time; eleven_multilingual_v2 for max quality
    raw_voice = (agent_config.get("tts_voice_id") or "").strip()
    default_voice = (app_settings.ELEVENLABS_DEFAULT_VOICE_ID or "bIHbv24MWmeRgasZH58o").strip()
    tts_voice_id = default_voice if (not raw_voice or "_" in raw_voice) else raw_voice
    tts_model = (
        (agent_config.get("tts_model") or "").strip()
        or app_settings.ELEVENLABS_TTS_MODEL
        or "eleven_turbo_v2_5"
    ).strip()
    # Stability: lower = more expressive (less robotic); similarity_boost: higher = closer to voice character
    tts_stability = float(agent_config.get("tts_stability", getattr(app_settings, "ELEVENLABS_TTS_STABILITY", 0.45)))
    tts_similarity = float(getattr(app_settings, "ELEVENLABS_TTS_SIMILARITY_BOOST", 0.75))
    tts_stability = max(0.0, min(1.0, tts_stability))
    tts_similarity = max(0.0, min(1.0, tts_similarity))
    voice_settings = elevenlabs_plugin.VoiceSettings(
        stability=tts_stability,
        similarity_boost=tts_similarity,
    )

    tts = elevenlabs_plugin.TTS(
        api_key=elevenlabs_key,
        voice_id=tts_voice_id,
        model=tts_model,
        voice_settings=voice_settings,
    )
    logger.info("TTS: ElevenLabs (voice=%s, model=%s, stability=%.2f)", tts_voice_id, tts_model, tts_stability)

    # AgentSession — use TurnHandlingConfig if available, else standard kwargs
    _session_kw: dict = {
        "vad": ctx.proc.userdata["vad"],
        "stt": stt,
        "llm": llm,
        "tts": tts,
        "turn_detection": "vad",
        "preemptive_generation": True,
    }
    # Fast turn-taking: low endpointing delay = quicker first response; allow barge-in
    try:
        from livekit.agents.voice import TurnHandlingConfig

        _session_kw["turn_handling"] = TurnHandlingConfig(
            min_endpointing_delay=0.05,
            max_endpointing_delay=0.5,
            allow_interruptions=True,
            min_interruption_duration=0.25,
            min_interruption_words=2,
        )
    except ImportError:
        _session_kw["allow_interruptions"] = True
        _session_kw["min_endpointing_delay"] = 0.05
        _session_kw["max_endpointing_delay"] = 0.5
        _session_kw["min_interruption_duration"] = 0.25
        _session_kw["min_interruption_words"] = 2

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

    @session.on("user_input_transcribed")
    def on_user_transcript(event: UserInputTranscribedEvent):
        if event.is_final and event.transcript.strip():
            text = event.transcript.strip()
            logger.info(f"User: {text}")
            transcript_lines.append(
                {
                    "role": "user",
                    "text": text,
                    "timestamp": datetime.utcnow().isoformat(),
                }
            )
            asyncio.ensure_future(send_transcript("user", text))

    @session.on("agent_speech_committed")
    def on_agent_speech(text: str):
        if text and text.strip():
            cleaned = text.strip()
            logger.info(f"Agent: {cleaned}")
            transcript_lines.append(
                {
                    "role": "agent",
                    "text": cleaned,
                    "timestamp": datetime.utcnow().isoformat(),
                }
            )
            asyncio.ensure_future(send_transcript("agent", cleaned))

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
                payload = json.dumps({"type": "transfer", "to": configured_transfer_number})
                await room.local_participant.publish_data(
                    payload.encode(), reliable=True
                )
            except Exception as e:
                logger.warning(f"Failed to publish transfer: {e}")
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
