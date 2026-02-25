@echo off
setlocal

set "ROOT=%~dp0"
set "GAME_DIR=%ROOT%webspill"
set "PORT=8000"
set "PY_CMD="

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

if not defined PY_CMD (
  echo Fant ikke Python ^("py" eller "python"^).
  echo Installer Python fra https://www.python.org/downloads/
  echo og huk av for "Add python.exe to PATH" under installasjon.
  pause
  exit /b 1
)

for /f %%P in ('powershell -NoProfile -Command "$ports = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort; $p = 8000; while ($ports -contains $p) { $p++ }; $p"') do set "PORT=%%P"

cd /d "%GAME_DIR%"
start "" "http://localhost:%PORT%"
echo Starter spillserver paa http://localhost:%PORT%
echo Trykk Ctrl+C for aa stoppe serveren.
%PY_CMD% -m http.server %PORT%
