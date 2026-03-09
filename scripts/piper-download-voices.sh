#!/usr/bin/env bash
# Phase 1: Download Piper voices on TTS server (e.g. 18.141.177.170).
# Run on the TTS host: ssh -i resona-main.pem ubuntu@18.141.177.170 'bash -s' < scripts/piper-download-voices.sh
# Or copy to server and run: cd ~/piper-voices && bash piper-download-voices.sh

set -e
cd ~/piper-voices

# Download voice catalog
wget -q "https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json" -O voices.json

# Check disk space
df -h /

# Download priority languages (medium + low quality only to save disk)
python3 << 'PYEOF'
import json, os, urllib.request, time

with open("voices.json") as f:
    voices = json.load(f)

PRIORITY_LANGS = ["en", "es", "fr", "de", "ar", "zh", "pt", "hi", "it", "ja", "ko", "ru", "nl", "pl", "tr"]
BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
QUALITIES = ["medium", "low"]

downloaded = 0
skipped = 0
failed = 0

for voice_key, voice in voices.items():
    lang_code = voice.get("language", {}).get("code", "").split("_")[0]
    if lang_code not in PRIORITY_LANGS:
        continue
    for file_path, file_info in voice.get("files", {}).items():
        quality_match = any(q in file_path for q in QUALITIES)
        if not quality_match:
            continue
        os.makedirs(os.path.dirname(file_path) if os.path.dirname(file_path) else ".", exist_ok=True)
        if os.path.exists(file_path):
            skipped += 1
            continue
        url = BASE + file_path
        print(f"Downloading {file_path}...")
        try:
            urllib.request.urlretrieve(url, file_path)
            downloaded += 1
            time.sleep(0.1)
        except Exception as e:
            print(f"  FAILED: {e}")
            failed += 1

print(f"\nDone. Downloaded: {downloaded}, Skipped: {skipped}, Failed: {failed}")
PYEOF

echo "---"
df -h /
echo "Voice .onnx count:"
find ~/piper-voices -name "*.onnx" 2>/dev/null | wc -l
