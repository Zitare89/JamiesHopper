@echo off
setlocal

set "ROOT=%~dp0"
set "GAME_DIR=%ROOT%webspill"
set "PORT=8000"
set "PY_CMD="
set "NODE_CMD="

if not exist "%GAME_DIR%\index.html" (
  echo Fant ikke spillet i "%GAME_DIR%".
  echo Sjekk at mappen "webspill" finnes i prosjektet.
  pause
  exit /b 1
)

where py >nul 2>nul
if not errorlevel 1 set "PY_CMD=py"

if not defined PY_CMD (
  where python >nul 2>nul
  if not errorlevel 1 set "PY_CMD=python"
)

if defined PY_CMD (
  %PY_CMD% -V >nul 2>nul
  if errorlevel 1 set "PY_CMD="
)

where node >nul 2>nul
if not errorlevel 1 set "NODE_CMD=node"

if not defined PY_CMD (
  if not defined NODE_CMD (
    echo Fant ikke Python ^("py" eller "python"^) eller Node.js.
    echo Installer Python fra https://www.python.org/downloads/
    echo eller installer Node.js fra https://nodejs.org/
    echo og prov igjen.
    pause
    exit /b 1
  )
)

if defined NODE_CMD (
  powershell -NoProfile -Command "$src = '%GAME_DIR%\\game.js'; $tmp = '%GAME_DIR%\\game.tmp.js'; Get-Content -Path $src -Raw | Set-Content -Path $tmp -Encoding utf8; if (-not (Test-Path $tmp)) { exit 1 }; & node --check `\"$tmp`\"; $code = $LASTEXITCODE; Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue; exit $code"
  if errorlevel 1 (
    echo Spillet kan ikke startes fordi game.js har en syntaksfeil.
    echo Fiks feilen og prov igjen.
    pause
    exit /b 1
  )
)

for /f %%P in ('powershell -NoProfile -Command "$ports = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort; $p = 8000; while ($ports -contains $p) { $p++ }; $p"') do set "PORT=%%P"

cd /d "%GAME_DIR%"
start "" "http://localhost:%PORT%"
echo Starter spillserver paa http://localhost:%PORT%
echo Trykk Ctrl+C for aa stoppe serveren.

if defined PY_CMD (
  %PY_CMD% -m http.server %PORT%
  if errorlevel 1 (
    echo Klarte ikke aa starte serveren med %PY_CMD%.
    echo Sjekk at Python er installert og at -m http.server fungerer.
    pause
    exit /b 1
  )
  pause
  exit /b 0
)

if defined NODE_CMD (
  node "%GAME_DIR%\\serve.js" %PORT%
  if errorlevel 1 (
    echo Klarte ikke aa starte serveren med Node.js.
    pause
    exit /b 1
  )
  pause
  exit /b 0
)
