
import asyncio
import json
import logging
import os
from dotenv import load_dotenv

load_dotenv()

from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
)
from livekit.agents.voice import Agent, AgentSession
from livekit.agents.voice.events import UserInputTranscribedEvent
from livekit.plugins import deepgram, elevenlabs, silero, groq

logger = logging.getLogger("resona-agent")
logging.basicConfig(level=logging.INFO)


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext):
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    participant = await ctx.wait_for_participant()

    agent_config = {}
    try:
        metadata = ctx.room.metadata
        if metadata:
            agent_config = json.loads(metadata)
    except Exception:
        pass

    system_prompt = agent_config.get(
        "system_prompt",
        "You are a helpful, friendly voice AI assistant. Keep responses short and conversational.",
    )
    first_message = agent_config.get("first_message", "Hi, how can I help you today?")
    VOICE_NAME_TO_ID = {
        "Rachel": "21m00Tcm4TlvDq8ikWAM",
        "Drew": "29vD33N1vc5IkxM6UTqy",
        "Clyde": "2EiwWnXFnvU5JabPnv8n",
        "Paul": "5Q0t7uMcjvnagumLfvZi",
        "Domi": "AZnzlk1XvdvUeBnXmlld",
        "Dave": "CYw3kZ78EhJOlQCFuako",
        "Fin": "D38z5RcWu1voky8WS1ja",
        "Bella": "EXAVITQu4vr4xnSDxMaL",
        "Antoni": "ErXwobaYiN019PkySvjV",
        "Thomas": "GBv7mTt0atIp3Br8iCZE",
        "Charlie": "IKne3meq5aSn9XLyUdCD",
        "Emily": "LcfcDJNUP1GQjkzn1xUU",
        "Elli": "MF3mGyEYCl7XYWbV9V6O",
        "Callum": "N2lVS1w4EtoT3dr4eOWO",
        "Patrick": "ODq5zmih8GrVes37Dy9p",
        "Harry": "SOYHLrjzK2X1ezoPC6cr",
        "Liam": "TX3LPaxmHKxFdv7VOQHJ",
        "Dorothy": "ThT5KcBeYPX3keUQqHPh",
        "Josh": "TxGEqnHWrfWFTfGW9XjX",
        "Arnold": "VR6AewLTigWG4xSOukaG",
        "Charlotte": "XB0fDUnXU5powFXDhCwa",
        "Alice": "Xb7hH8MSUJpSbSDYk0k2",
        "Matilda": "XrExE9yKIg1WjnnlVkGX",
        "James": "ZQe5CZNOzWyzPSCn5a3c",
        "Joseph": "Zlb1dXrM653N07WRdFW3",
    }
    voice_name = agent_config.get("tts_voice_id", "Josh")
    voice_id = VOICE_NAME_TO_ID.get(voice_name, "TxGEqnHWrfWFTfGW9XjX")

    async def send_transcript(role: str, text: str):
        try:
            payload = json.dumps({"type": "transcript", "role": role, "text": text})
            await ctx.room.local_participant.publish_data(
                payload.encode(), reliable=True
            )
        except Exception as e:
            logger.warning(f"Failed to send transcript: {e}")

    session = AgentSession(
        vad=ctx.proc.userdata["vad"],
        stt=deepgram.STT(
            model="nova-2-general",
            api_key=os.environ.get("DEEPGRAM_API_KEY"),
        ),
        llm=groq.LLM(
            model="llama-3.3-70b-versatile",
            api_key=os.environ.get("GROQ_API_KEY"),
        ),
        tts=elevenlabs.TTS(
            voice_id=voice_id,
            api_key=os.environ.get("ELEVENLABS_API_KEY"),
        ),
    )

    @session.on("user_input_transcribed")
    def on_user_transcript(event: UserInputTranscribedEvent):
        if event.is_final and event.transcript.strip():
            logger.info(f"User: {event.transcript}")
            asyncio.ensure_future(send_transcript("user", event.transcript))

    @session.on("agent_speech_committed")
    def on_agent_speech(text: str):
        if text and text.strip():
            logger.info(f"Agent: {text}")
            asyncio.ensure_future(send_transcript("agent", text))

    await session.start(
        agent=Agent(instructions=system_prompt),
        room=ctx.room,
    )

    agent_speaks_first = agent_config.get("agent_speaks_first", True)
    if agent_speaks_first:
        await session.say(first_message, allow_interruptions=True)


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
        )
    )