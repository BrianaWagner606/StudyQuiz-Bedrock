@echo off
title Study Quiz - Proxy Self Test
setlocal
cd /d "%~dp0"

echo ============================================================
echo   Study Quiz - Proxy Self Test
echo ============================================================
echo.
echo This sends the SAME kind of request Minecraft sends, so we can
echo see exactly where AI is failing - WITHOUT starting Minecraft.
echo.
echo Make sure the proxy window (start-proxy.bat) is OPEN first.
echo.
pause
echo.

REM Step 1: is the proxy even up?
echo [1/2] Checking the proxy is running (http://127.0.0.1:8787/health) ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $h = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/health' -TimeoutSec 10; Write-Host ('   OK - proxy is running. keyLoaded=' + $h.keyLoaded + '  model=' + $h.model) -ForegroundColor Green } catch { Write-Host '   FAIL - the proxy is NOT running. Start start-proxy.bat first.' -ForegroundColor Red; exit 1 }"
if errorlevel 1 goto end

echo.
echo [2/2] Asking the AI a real test question (this calls Anthropic) ...
echo       Please wait up to 30 seconds...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$body = @{ model='claude-haiku-4-5-20251001'; max_tokens=64; messages=@(@{ role='user'; content='Reply with exactly the word: WORKING' }) } | ConvertTo-Json -Depth 5;" ^
  "try {" ^
  "  $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/v1/chat/completions' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 35;" ^
  "  $text = $r.choices[0].message.content;" ^
  "  Write-Host '   SUCCESS! The AI replied:' -ForegroundColor Green;" ^
  "  Write-Host ('   >>> ' + $text) -ForegroundColor Green;" ^
  "  Write-Host '';" ^
  "  Write-Host '   Your proxy + API key work. If Minecraft still fails, the problem' -ForegroundColor Green;" ^
  "  Write-Host '   is between the game and the proxy (firewall/permissions), not the key.' -ForegroundColor Green;" ^
  "} catch {" ^
  "  Write-Host '   FAIL - the proxy could not get an answer from Anthropic.' -ForegroundColor Red;" ^
  "  Write-Host '   This usually means: the API key is wrong/expired, or there is no' -ForegroundColor Red;" ^
  "  Write-Host '   internet/billing for that key. Full error below:' -ForegroundColor Red;" ^
  "  Write-Host '';" ^
  "  if ($_.ErrorDetails.Message) { Write-Host ('   ' + $_.ErrorDetails.Message) -ForegroundColor Yellow }" ^
  "  else { Write-Host ('   ' + $_.Exception.Message) -ForegroundColor Yellow }" ^
  "  Write-Host '';" ^
  "  Write-Host '   --> Also LOOK AT THE PROXY WINDOW now. It prints the real reason' -ForegroundColor Yellow;" ^
  "  Write-Host '       (for example a 401 = bad key, or 400 = bad model name).' -ForegroundColor Yellow;" ^
  "}"

:end
echo.
echo ============================================================
echo  Tip: keep the proxy window visible while you test in Minecraft.
echo  Every quiz should make a new line appear in that window.
echo ============================================================
echo.
pause
