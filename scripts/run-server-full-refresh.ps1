# Run from your PC: SSH to server and execute full refresh (wipe, clone LiveKit-ElevenLabs repo, rebuild, restart).
# Usage: .\scripts\run-server-full-refresh.ps1

$keyPath = "C:\Users\Mark Edward\Downloads\resona-main.pem"
$user = "ubuntu"
$host = "18.141.140.150"

$scriptPath = Join-Path $PSScriptRoot "server-full-refresh-pull-redeploy.sh"
if (-not (Test-Path $scriptPath)) {
    Write-Error "Script not found: $scriptPath"
    exit 1
}

Write-Host "Connecting to ${user}@${host} and running full refresh (wipe, clone, deploy)..." -ForegroundColor Cyan
(Get-Content $scriptPath -Raw) -replace "`r`n", "`n" | ssh -i $keyPath -o StrictHostKeyChecking=no "${user}@${host}" "bash -s"
