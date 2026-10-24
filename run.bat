@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Ledger of the Undead - launcher

echo ============================================
echo  Ledger of the Undead - one-click launcher
echo ============================================
echo.

:: ---------- 1. Python environment ----------
if not exist ".venv\Scripts\python.exe" (
  echo [1/3] Creating Python virtual environment...
  python -m venv .venv
  if errorlevel 1 goto :setup_failed
  echo       Installing backend dependencies...
  ".venv\Scripts\python.exe" -m pip install --quiet -r requirements.txt
  if errorlevel 1 goto :setup_failed
) else (
  echo [1/3] Python environment: OK
  ".venv\Scripts\python.exe" -c "import fastapi, uvicorn, httpx, dotenv" >nul 2>&1
  if errorlevel 1 (
    echo       Installing missing backend dependencies...
    ".venv\Scripts\python.exe" -m pip install --quiet -r requirements.txt
    if errorlevel 1 goto :setup_failed
  )
)

:: ---------- 2. Dashboard build ----------
if not exist "frontend\dist\index.html" (
  where npm >nul 2>&1
  if errorlevel 1 (
    echo [2/3] Node.js/npm not found - cannot build the dashboard.
    echo       Install Node 18+ and rerun, or start the API only with:
    echo       .venv\Scripts\python -m uvicorn app.main:app --port 8000
    goto :setup_failed
  )
  echo [2/3] Building dashboard - first run may take a minute...
  pushd frontend
  if not exist "node_modules" (
    call npm install
    if errorlevel 1 ( popd & goto :setup_failed )
  )
  call npm run build
  if errorlevel 1 ( popd & goto :setup_failed )
  popd
) else (
  echo [2/3] Dashboard build: OK
)

:: ---------- 3. Start ----------
echo [3/3] Starting API + dashboard on http://127.0.0.1:8000
echo       Close the "Ledger API" window to stop the server.
echo.

powershell -NoProfile -Command "try { if((Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health -TimeoutSec 2).StatusCode -eq 200){ exit 0 } } catch {}; exit 1" >nul 2>&1
if %errorlevel% equ 0 (
  echo       Server already running - opening the dashboard.
) else (
  start "Ledger API" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
  powershell -NoProfile -Command "$ok=$false; for($i=0;$i -lt 40;$i++){ try{ if((Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health -TimeoutSec 1).StatusCode -eq 200){ $ok=$true; break } }catch{}; Start-Sleep -Milliseconds 500 }; if(-not $ok){ Write-Host 'Server did not answer yet - check the Ledger API window.' }"
)

start "" http://127.0.0.1:8000/

if /i "%~1"=="tunnel" (
  if not exist "tools\cloudflared.exe" (
    echo       Tunnel binary missing: tools\cloudflared.exe
  ) else (
    start "Ledger tunnel" cmd /k "tools\cloudflared.exe tunnel --url http://127.0.0.1:8000"
    echo       Tunnel starting - the public https://...trycloudflare.com link appears in the Ledger tunnel window.
  )
)

echo.
echo Done. Dashboard: http://127.0.0.1:8000/
if /i not "%~1"=="tunnel" echo For a public link, run:  run.bat tunnel
exit /b 0

:setup_failed
echo.
echo Setup failed - read the messages above.
pause
exit /b 1
