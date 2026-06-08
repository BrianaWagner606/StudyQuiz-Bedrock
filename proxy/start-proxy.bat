@echo off
title Study Quiz - AI Gateway
REM ============================================================
REM  Study Quiz local AI gateway launcher.
REM  Keep this window OPEN while you play. Close it to stop.
REM ============================================================
cd /d "%~dp0"

echo ============================================================
echo   Study Quiz - AI Gateway
echo ============================================================
echo.

REM --- 1. Check that Node.js is installed ---
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not on your PATH.
    echo.
    echo This gateway needs Node.js to run.
    echo   1. Download it from:  https://nodejs.org  ^(the "LTS" button^)
    echo   2. Install it ^(default options are fine^).
    echo   3. Close this window and run start-proxy.bat again.
    echo.
    pause
    exit /b 1
)

REM --- 2. Check that an API key file exists ---
if not exist "anthropic-key.txt" (
    echo [ERROR] Missing your API key file:  anthropic-key.txt
    echo.
    echo   1. Make a copy of  anthropic-key.example.txt
    echo   2. Rename the copy to  anthropic-key.txt
    echo   3. Open it and paste YOUR OWN Anthropic API key ^(one line^).
    echo   4. Run start-proxy.bat again.
    echo.
    pause
    exit /b 1
)

REM --- 3. Start the gateway ---
echo Starting gateway... keep this window open while you play.
echo Press Ctrl+C or close this window to stop it.
echo.
node server.js

REM If node exits (error or stopped), keep the window open so the message is readable.
echo.
echo The gateway has stopped.
pause
