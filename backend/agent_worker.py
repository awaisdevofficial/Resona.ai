import asyncio
import json
import logging
import os
import time
from datetime import datetime

from dotenv import load_dotenv

from app.config import settings as app_settings
from app.constants import (
    DEFAULT_CARTESIA_VOICE_ID,
    DEFAULT_PIPER_VOICE,
    get_tts_provider_and_voice_id,
    _is_cartesia_voice_id,
)
from app.prompts import get_full_system_prompt
import httpx
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
from livekit.plugins import cartesia, deepgram, silero, groq

load_dotenv()


def _base_url_from_speech_url(url: str) -> str:
    """Normalize PIPER_TTS_URL / WHISPER_STT_URL to OpenAI-style base (e.g. http://host:port/v1)."""
    url = (url or "").strip().rstrip("/")
    if not url:
        return ""
    if "/v1" in url:
        idx = url.find("/v1")
        return url[: idx + 3]  # include "/v1" (no trailing slash)
    return url if url.endswith("/v1") else f"{url}/v1"

logger = logging.getLogger("resona-agent")
logging.basicConfig(level=logging.INFO)


async def end_call(call_id: str, transcript_lines: list, duration: int):
    if not call_id:
        return
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{os.environ.get('API_BASE_URL', 'http://localhost:8000')}/internal/calls/{call_id}/transcript",
                json={"lines": transcript_lines, "duration_seconds": duration},
                headers={"X-Internal-Secret": os.environ.get("INTERNAL_SECRET", "")},
                timeout=10,
            )
    except Exception as e:
        logger.warning(f"Failed to save transcript: {e}")


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext):
    logger.info("Agent job started room=%s", ctx.room.name)
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

    # If no metadata was provided, this is likely an inbound SIP call where
    # the room was created by a dispatch rule using the `sip-{user_id}-*` prefix.
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
            # Fallback config if we couldn't resolve a user/agent (short first message for fast TTS start)
            agent_config = {
                "system_prompt": "You are a helpful voice AI assistant.",
                "first_message": "Hi, how can I help?",
                "tts_provider": "cartesia",
                "tts_voice_id": DEFAULT_CARTESIA_VOICE_ID,
            }

    base_system_prompt = agent_config.get(
        "system_prompt",
        "You are a helpful, friendly voice AI assistant. Keep responses short and conversational.",
    )
    kb_content = agent_config.get("knowledge_base", "")
    if kb_content:
        base_system_prompt = (
            base_system_prompt
            + "\n\n=== KNOWLEDGE BASE ===\n"
            + kb_content
            + "\n=== END KNOWLEDGE BASE ==="
        )
    # Prepend human-behavior instructions (metadata may already include them; avoid duplicate)
    if base_system_prompt.strip().startswith("Speak exactly like a real human"):
        system_prompt = base_system_prompt
    else:
        system_prompt = get_full_system_prompt(base_system_prompt)
    first_message = agent_config.get("first_message", "Hi, how can I help?")

    # Determine TTS/STT configuration from metadata (STT=Deepgram, TTS=Cartesia default)
    stt_language = agent_config.get("stt_language", "en-US")
    stt_model = agent_config.get("stt_model") or "nova-2-general"

    _, tts_voice_id = get_tts_provider_and_voice_id(
        agent_config.get("tts_provider"), agent_config.get("tts_voice_id")
    )

    # Track transcript lines and call duration
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

    # STT: self-hosted Whisper (WHISPER_STT_URL) or Deepgram
    whisper_stt_url = os.environ.get("WHISPER_STT_URL", "").strip()
    groq_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not groq_key:
        raise RuntimeError("GROQ_API_KEY is required for the LLM. Set it in the environment.")

    if whisper_stt_url:
        from livekit.plugins import openai as openai_plugin
        whisper_base = _base_url_from_speech_url(whisper_stt_url)
        if not whisper_base:
            raise RuntimeError("WHISPER_STT_URL must be a valid URL (e.g. http://host:8000/v1/audio/transcriptions).")
        # Self-hosted Whisper: OpenAI-compatible API; dummy key if no auth required
        stt = openai_plugin.STT(
            model="whisper-1",
            language=(stt_language or "en").split("-")[0],
            base_url=whisper_base,
            api_key=os.environ.get("OPENAI_API_KEY", "sk-self-hosted"),
            use_realtime=False,
        )
        logger.info("STT: self-hosted Whisper at %s", whisper_base)
    else:
        deepgram_key = os.environ.get("DEEPGRAM_API_KEY", "").strip()
        if not deepgram_key:
            raise RuntimeError("DEEPGRAM_API_KEY or WHISPER_STT_URL is required for STT. Set one in the environment.")
        # STT: 200ms endpointing; no filler_words (faster STT finalization)
        stt = deepgram.STT(
            model=stt_model,
            api_key=deepgram_key,
            language=stt_language or "en-US",
            sample_rate=16000,
            interim_results=True,
            endpointing_ms=200,
            no_delay=True,
            vad_events=True,
            filler_words=False,
        )
        logger.info("STT: Deepgram")
    # LLM: Groq primary; OpenAI as fallback on rate limit (429) or connection errors
    primary_llm = groq.LLM(
        model="llama-3.3-70b-versatile",
        api_key=groq_key,
        max_tokens=80,
    )
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if openai_key:
        from livekit.plugins import openai as openai_plugin
        fallback_llm = openai_plugin.LLM(
            model="gpt-4o-mini",
            api_key=openai_key,
        )
        llm = FallbackAdapter(
            llm=[primary_llm, fallback_llm],
            attempt_timeout=15.0,
            max_retry_per_llm=0,
        )
        logger.info("LLM: Groq primary with OpenAI fallback (gpt-4o-mini)")
    else:
        llm = primary_llm
        logger.info("LLM: Groq only (set OPENAI_API_KEY for fallback)")
    # TTS: self-hosted Piper (PIPER_TTS_URL) first, then Cartesia
    piper_tts_url = os.environ.get("PIPER_TTS_URL", "").strip()
    if piper_tts_url:
        from livekit.plugins import openai as openai_plugin
        piper_base = _base_url_from_speech_url(piper_tts_url)
        if not piper_base:
            raise RuntimeError("PIPER_TTS_URL must be a valid URL (e.g. http://host:8880/v1/audio/speech).")
        # Piper voice: use agent's tts_voice_id if set and not a Cartesia UUID, else config default.
        raw_voice = (agent_config.get("tts_voice_id") or "").strip()
        if _is_cartesia_voice_id(raw_voice) or not raw_voice:
            piper_voice = (app_settings.PIPER_TTS_VOICE or DEFAULT_PIPER_VOICE or "en_US-amy-medium").strip()
        else:
            piper_voice = raw_voice
        piper_model = app_settings.PIPER_TTS_MODEL or "tts-1"
        tts = openai_plugin.TTS(
            model=piper_model,
            voice=piper_voice,
            base_url=piper_base,
            api_key=os.environ.get("OPENAI_API_KEY", "sk-self-hosted"),
            response_format="mp3",
        )
        logger.info("TTS: self-hosted Piper at %s (model=%s voice=%s)", piper_base, piper_model, piper_voice)
    else:
        cartesia_key = os.environ.get("CARTESIA_API_KEY", "").strip()
        if not cartesia_key:
            raise RuntimeError(
                "CARTESIA_API_KEY or PIPER_TTS_URL is required for TTS. Set one in the environment."
            )
        tts = cartesia.TTS(
            model="sonic-3",
            voice=tts_voice_id or DEFAULT_CARTESIA_VOICE_ID,
            api_key=cartesia_key,
            sample_rate=24000,
        )
        logger.info("TTS: Cartesia")

    # Use VAD for turn detection; prefer TurnHandlingConfig when available (livekit-agents 1.5+).
    _session_kw: dict = {
        "vad": ctx.proc.userdata["vad"],
        "stt": stt,
        "llm": llm,
        "tts": tts,
        "turn_detection": "vad",
        "preemptive_generation": True,
    }
    try:
        from livekit.agents.voice import TurnHandlingConfig
        _session_kw["turn_handling"] = TurnHandlingConfig(
            min_endpointing_delay=0.1,
            max_endpointing_delay=0.6,
            allow_interruptions=True,
            min_interruption_duration=0.3,
            min_interruption_words=2,
        )
    except ImportError:
        _session_kw["allow_interruptions"] = True
        _session_kw["min_endpointing_delay"] = 0.1
        _session_kw["max_endpointing_delay"] = 0.6
        _session_kw["min_interruption_duration"] = 0.3
        _session_kw["min_interruption_words"] = 2
    # Self-hosted LiveKit: disable cloud barge-in; use local VAD only. Optional args (livekit-agents 1.5+).
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

    def make_transfer_tool(room):
        @function_tool
        async def transfer_call(transfer_to: str) -> str:
            """Transfer the current call to a human agent or another number.
            Use this when the user asks to speak to a human, or when you cannot help them.
            transfer_to: the phone number or department to transfer to.
            """
            try:
                payload = json.dumps({"type": "transfer", "to": transfer_to})
                await room.local_participant.publish_data(
                    payload.encode(), reliable=True
                )
            except Exception as e:
                logger.warning(f"Failed to publish transfer: {e}")
            return "Transferring you now. Please hold."

        return transfer_call

    transfer_tool = make_transfer_tool(ctx.room)
    logger.info(
        "Starting voice session room=%s agent_speaks_first=%s",
        ctx.room.name,
        agent_config.get("agent_speaks_first", True),
    )
    # Deepgram STT expects 16 kHz; use RoomOptions (RoomInputOptions is deprecated).
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
    say_text = (first_message or "Hi, how can I help?").strip()
    if agent_speaks_first and say_text:
        try:
            await session.say(say_text, allow_interruptions=True)
            logger.info("First message sent: %s", say_text[:50] + ("..." if len(say_text) > 50 else ""))
        except Exception as e:
            logger.exception("Agent TTS/say failed: %s", e)


if __name__ == "__main__":
    # Default HTTP port 8081; override with LIVEKIT_AGENT_HTTP_PORT if something else uses 8081
    _http_port = int(os.environ.get("LIVEKIT_AGENT_HTTP_PORT", "8081"))
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            port=_http_port,
        )
    )