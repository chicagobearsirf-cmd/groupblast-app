@echo off
REM GroupBlast launcher for Windows
setlocal enabledelayedexpansion

echo Starting GroupBlast...
echo.

REM Check if node_modules exists (first-run setup needed)
if not exist "node_modules" (
    echo First time setup — this may take a few minutes. Please wait...
    call npm install
    call npx playwright install chromium
    echo.
    echo Setup complete!
    echo.
)

REM Start the dev servers in background
echo Launching GroupBlast — keep this window open while you work.
echo Close this window to stop GroupBlast.
echo.

REM Open browser once server is ready
start /b timeout /t 1 /nobreak > nul
powershell -Command "for ($i=1; $i -le 60; $i++) { try { $response = Invoke-WebRequest -Uri 'http://localhost:8080' -UseBasicParsing -TimeoutSec 1; Start-Process 'http://localhost:8080'; break } catch { Start-Sleep -Seconds 1 } }"

REM Run the dev servers
call npm run dev

pause
