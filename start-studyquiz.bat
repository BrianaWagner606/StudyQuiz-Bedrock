@echo off
title Study Quiz - Launcher
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo(
echo  ============================================================
echo    Study Quiz - one-click launcher
echo  ============================================================
echo(

REM --- Remember the Bedrock server folder between runs ---
set "CFG=%~dp0bds-path.txt"
set "BDS="
if exist "%CFG%" set /p "BDS="<"%CFG%"

if not exist "!BDS!\bedrock_server.exe" (
  echo  First time? I need the folder that has bedrock_server.exe in it.
  echo(
  set /p "BDS=  Paste your Bedrock server folder and press Enter: "
  set "BDS=!BDS:"=!"
  if not exist "!BDS!\bedrock_server.exe" (
    echo(
    echo  [X] Couldn't find bedrock_server.exe in: !BDS!
    echo      Double-click this again and paste the right folder.
    echo(
    pause
    exit /b 1
  )
  >"%CFG%" echo !BDS!
  echo  Saved - it'll start instantly next time.
  echo(
)

REM --- Only start the local proxy if the server is set to use it. If the
REM     server points at the cloud, no proxy is needed. ---
set "UCFG=!BDS!\behavior_packs\study_quiz_bp\scripts\userConfig.js"
set "START_PROXY=1"
if exist "!UCFG!" (
  findstr /R "USER_API_ENDPOINT.*127" "!UCFG!" >nul 2>&1
  if errorlevel 1 set "START_PROXY=0"
)

if "!START_PROXY!"=="1" (
  echo  Starting the AI proxy...
  start "Study Quiz - AI Proxy" /D "%~dp0proxy" cmd /k node server.js
  timeout /t 3 /nobreak >nul
) else (
  echo  Server is set to use the cloud - skipping the local proxy.
)

echo  Starting the Bedrock server...
start "Study Quiz - Server" /D "!BDS!" cmd /k bedrock_server.exe

echo(
echo  Done! In the SERVER window, wait for:  [StudyQuiz] Loaded.
echo  Then join  127.0.0.1  in Minecraft.
echo  To stop: close those windows (or type  stop  in the server window).
echo(
timeout /t 8 /nobreak >nul
