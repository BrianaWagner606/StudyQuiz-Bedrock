@echo off
REM Start the Study Quiz local AI gateway. Keep this window open while playing.
cd /d "%~dp0"
node server.js
pause
