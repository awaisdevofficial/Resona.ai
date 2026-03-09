# Deploy updated piper_server.py to TTS server and restart Piper.
# Run from repo root. Uses tts-stt-server.pem in Downloads.
# Usage: .\scripts\deploy-piper-to-tts.ps1

$ErrorActionPreference = "Stop"
$TTS_HOST = "18.141.177.170"
$KEY = "$env:USERPROFILE\Downloads\tts-stt-server.pem"
$PROJECT_ROOT = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path $KEY)) {
  Write-Host "Key not found: $KEY"
  Write-Host "Set KEY path or copy tts-stt-server.pem to Downloads."
  exit 1
}
$piperScript = Join-Path $PROJECT_ROOT "scripts\piper_server.py"
if (-not (Test-Path $piperScript)) {
  Write-Host "Not found: $piperScript"
  exit 1
}
Write-Host "Copying piper_server.py to TTS server..."
scp -i $KEY -o StrictHostKeyChecking=accept-new $piperScript "ubuntu@${TTS_HOST}:/home/ubuntu/piper_server.py"
Write-Host "Restarting Piper on TTS server..."
ssh -i $KEY -o StrictHostKeyChecking=accept-new "ubuntu@$TTS_HOST" "sudo systemctl restart piper-tts.service; sleep 1; curl -s http://127.0.0.1:8880/health"
Write-Host "Done. Voice previews will now use strict mode (each voice only if installed)."
