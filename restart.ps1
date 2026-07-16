<#
.SYNOPSIS
Restart DataNova backend and frontend dev servers
.DESCRIPTION
Kills any running node processes on ports 3000 (backend) and 5173 (frontend),
then starts both dev servers in the background.
#>

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== DataNova Restart Script ===" -ForegroundColor Cyan

# Kill existing processes on ports 3000 and 5173
$ports = @(3000, 5173)
foreach ($port in $ports) {
    $connections = netstat -ano | Select-String ":$port\s" | Select-String "LISTENING"
    foreach ($conn in $connections) {
        $parts = $conn -split '\s+'
        $pid = $parts[-1]
        if ($pid -match '^\d+$') {
            Write-Host "  Killing PID $pid on port $port..." -ForegroundColor Yellow
            Stop-Process -Id ([int]$pid) -Force -ErrorAction SilentlyContinue
        }
    }
}

Start-Sleep -Seconds 2

# Start backend
Write-Host "  Starting backend (port 3000)..." -ForegroundColor Green
$backend = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev:server" -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru

Start-Sleep -Seconds 3

# Start frontend
Write-Host "  Starting frontend (port 5173)..." -ForegroundColor Green
$frontend = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev:web" -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru

Start-Sleep -Seconds 5

# Verify
$beUp = (netstat -ano | Select-String ":3000\s" | Select-String "LISTENING") -ne $null
$feUp = (netstat -ano | Select-String ":5173\s" | Select-String "LISTENING") -ne $null

if ($beUp) {
    Write-Host "  Backend:  RUNNING on port 3000" -ForegroundColor Green
} else {
    Write-Host "  Backend:  NOT RUNNING" -ForegroundColor Red
}
if ($feUp) {
    Write-Host "  Frontend: RUNNING on port 5173" -ForegroundColor Green
} else {
    Write-Host "  Frontend: NOT RUNNING" -ForegroundColor Red
}

Write-Host "=== Done ===" -ForegroundColor Cyan
