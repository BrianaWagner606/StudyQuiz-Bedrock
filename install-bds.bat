@echo off
title Study Quiz - BDS Installer
setlocal enabledelayedexpansion
REM ============================================================
REM  One-click installer for Bedrock Dedicated Server (BDS).
REM  Copies the packs into your server, sets up permissions.json,
REM  and prints the exact lines to add to your world files.
REM ============================================================
cd /d "%~dp0"

echo ============================================================
echo   Study Quiz - Bedrock Dedicated Server Installer
echo ============================================================
echo.
echo This will install the add-on into your Bedrock Dedicated Server.
echo.
echo Tip: your BDS folder is the one that contains "bedrock_server.exe".
echo.

set /p BDS="Paste the full path to your BDS folder and press Enter: "

REM Strip surrounding quotes if the user pasted them.
set BDS=%BDS:"=%

if not exist "%BDS%\bedrock_server.exe" (
    echo.
    echo [ERROR] I could not find bedrock_server.exe in:
    echo     %BDS%
    echo.
    echo Please re-run and paste the correct BDS folder path.
    echo.
    pause
    exit /b 1
)

echo.
echo Installing into: %BDS%
echo.

REM --- 1. Behavior pack ---
echo [1/4] Copying behavior pack...
robocopy "study_quiz_bp" "%BDS%\behavior_packs\study_quiz_bp" /E /NFL /NDL /NJH /NJS /NC /NS >nul

REM --- 2. Resource pack ---
echo [2/4] Copying resource pack...
robocopy "study_quiz_rp" "%BDS%\resource_packs\study_quiz_rp" /E /NFL /NDL /NJH /NJS /NC /NS >nul

REM --- 3. Permissions (the step people miss) ---
echo [3/4] Setting up permissions.json (allows AI web requests)...
if not exist "%BDS%\config\default" mkdir "%BDS%\config\default"
(
echo {
echo   "allowed_modules": [
echo     "@minecraft/server",
echo     "@minecraft/server-ui",
echo     "@minecraft/server-net",
echo     "@minecraft/server-admin"
echo   ]
echo }
) > "%BDS%\config\default\permissions.json"

REM --- 4. Tell the user how to attach packs to their world ---
echo [4/4] Done copying files.
echo.
echo ============================================================
echo   ALMOST DONE - attach the packs to your world
echo ============================================================
echo.
echo Open your world folder:  %BDS%\worlds\YOUR-LEVEL-NAME\
echo ^(YOUR-LEVEL-NAME is the "level-name" value in server.properties^)
echo.
echo Make sure these two files exist with this content:
echo.
echo   world_behavior_packs.json
echo     [ { "pack_id": "7f01af09-a5e4-45cf-9f36-696f96a50c0b", "version": [1,0,0] } ]
echo.
echo   world_resource_packs.json
echo     [ { "pack_id": "b2d6f3a1-9c44-4e7a-8f12-3a7e5c901d44", "version": [1,0,0] } ]
echo.
echo Then (optional, for AI questions) run proxy\start-proxy.bat,
echo and finally start your server.
echo.
echo See USER_GUIDE.md for full details.
echo ============================================================
echo.
pause
