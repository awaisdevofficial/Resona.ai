"""
Piper TTS FastAPI server. Deploy to TTS host (e.g. 18.141.177.170) and run with:
  uvicorn piper_server:app --host 0.0.0.0 --port 8880
Or use systemd service piper-tts.
"""
import json
import os
import subprocess
import tempfile
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

app = FastAPI()

VOICES_DIR = "/home/ubuntu/piper-voices"
VOICES_JSON = os.path.join(VOICES_DIR, "voices.json")
PIPER_BIN = "/home/ubuntu/.local/bin/piper"


def get_available_voices():
    if not os.path.exists(VOICES_JSON):
        return []
    with open(VOICES_JSON) as f:
        catalog = json.load(f)
    available = []
    for voice_key, voice in catalog.items():
        onnx_files = [
            p for p in voice.get("files", {}).keys()
            if p.endswith(".onnx") and not p.endswith(".onnx.json")
        ]
        for onnx_path in onnx_files:
            full_path = os.path.join(VOICES_DIR, onnx_path)
            if not os.path.exists(full_path):
                continue
            lang = voice.get("language", {})
            parts = onnx_path.replace(".onnx", "").split("-")
            quality = parts[-1] if parts else "medium"
            available.append({
                "id": voice_key,
                "name": voice.get("name", voice_key).replace("_", " ").title(),
                "provider": "piper",
                "language": lang.get("name_english", "Unknown"),
                "language_code": lang.get("code", ""),
                "country": lang.get("country_english", ""),
                "gender": voice.get("gender", "neutral"),
                "quality": quality,
                "description": f"{lang.get('name_english', 'Unknown')} — {voice.get('gender', 'neutral').title()}",
                "onnx_path": full_path,
            })
    available.sort(key=lambda v: (v["language"], v["name"]))
    return available


def find_onnx(voice_id: str, voices: list) -> str | None:
    voice_map = {v["id"]: v["onnx_path"] for v in voices}
    if voice_id in voice_map:
        return voice_map[voice_id]
    for vid, vpath in voice_map.items():
        if voice_id in vid or vid in voice_id:
            return vpath
    for v in voices:
        if v.get("language_code", "").startswith("en"):
            return v["onnx_path"]
    return voices[0]["onnx_path"] if voices else None


class TTSRequest(BaseModel):
    input: str
    model: str = "tts-1"
    voice: str = "en_US-amy-medium"


@app.post("/v1/audio/speech")
async def synthesize(req: TTSRequest):
    voices = get_available_voices()
    if not voices:
        raise HTTPException(status_code=503, detail="No voices available")
    onnx_path = find_onnx(req.voice, voices)
    if not onnx_path:
        raise HTTPException(status_code=404, detail=f"Voice '{req.voice}' not found")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        out_path = f.name
    try:
        result = subprocess.run(
            [PIPER_BIN, "--model", onnx_path, "--output_file", out_path],
            input=req.input.encode(),
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Piper error: {result.stderr.decode()}")
        with open(out_path, "rb") as f:
            audio = f.read()
    finally:
        if os.path.exists(out_path):
            os.unlink(out_path)
    return Response(content=audio, media_type="audio/wav")


@app.get("/v1/voices")
async def voices_list():
    return get_available_voices()


@app.get("/health")
async def health():
    v = get_available_voices()
    return {"status": "ok", "voices_available": len(v)}
