import asyncio
import json
import logging
import os
import time
from datetime import datetime

from dotenv import load_dotenv

from app.constants import DEFAULT_CARTESIA_VOICE_ID, get_tts_provider_and_voice_id
from app.prompts import get_full_system_prompt
import httpx
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
)
from livekit.agents.llm import function_tool
from livekit.agents.voice import Agent, AgentSession
from livekit.agents.voice.events import UserInputTranscribedEvent
from livekit.agents.voice import room_io as voice_room_io
from livekit.plugins import cartesia, deepgram, silero, groq

load_dotenv()

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

    # STT: Deepgram only
    deepgram_key = os.environ.get("DEEPGRAM_API_KEY", "").strip()
    if not deepgram_key:
        raise RuntimeError("DEEPGRAM_API_KEY is required for STT. Set it in the environment.")
    groq_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not groq_key:
        raise RuntimeError("GROQ_API_KEY is required for the LLM. Set it in the environment.")

    # Low-latency STT: interim results, aggressive endpointing, VAD events for fast turn-taking
    stt = deepgram.STT(
        model=stt_model,
        api_key=deepgram_key,
        language=stt_language or "en-US",
        sample_rate=16000,
        interim_results=True,
        endpointing_ms=25,
        no_delay=True,
        vad_events=True,
        filler_words=True,
    )
    # LLM: Groq (streaming); keep responses short via prompt so TTS starts quickly
    llm = groq.LLM(
        model="llama-3.3-70b-versatile",
        api_key=groq_key,
    )
    # TTS: Cartesia only
    cartesia_key = os.environ.get("CARTESIA_API_KEY", "").strip()
    if not cartesia_key:
        raise RuntimeError("CARTESIA_API_KEY is required for TTS. Set it in the environment.")
    tts = cartesia.TTS(
        model="sonic-3",
        voice=tts_voice_id or DEFAULT_CARTESIA_VOICE_ID,
        api_key=cartesia_key,
        sample_rate=24000,
    )

    # Use VAD for turn detection so we interrupt on voice activity immediately (no wait for STT).
    # Only pass kwargs supported by the installed livekit-agents version (server may be older).
    _session_kw: dict = {
        "vad": ctx.proc.userdata["vad"],
        "stt": stt,
        "llm": llm,
        "tts": tts,
        "turn_detection": "vad",
        "allow_interruptions": True,
        "min_endpointing_delay": 0.3,
        "max_endpointing_delay": 1.5,
        "min_interruption_duration": 0.08,
        "min_interruption_words": 0,
        "preemptive_generation": True,
    }
    # Optional args (supported in livekit-agents 1.5+); skip on older SDK to avoid TypeError
    try:
        from inspect import signature
        sig = signature(AgentSession.__init__)
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
    # Deepgram STT expects 16 kHz; set room input to 16 kHz so user voice reaches STT correctly.
    try:
        await session.start(
            agent=Agent(instructions=system_prompt, tools=[transfer_tool]),
            room=ctx.room,
            room_input_options=voice_room_io.RoomInputOptions(audio_sample_rate=16000),
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