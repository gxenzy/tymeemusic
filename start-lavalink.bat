@echo off
setlocal

REM TymeeMusic - Lavalink starter (Windows)
REM This runs Lavalink with flags to force the local application.yml and disable Spring Cloud config import checks.

cd /d "%~dp0"

if not exist "Lavalink.jar" (
  echo [ERROR] Lavalink.jar not found in: %cd%
  echo Make sure this .bat file is placed in the same folder as Lavalink.jar
  echo.
  pause
  exit /b 1
)

if not exist "application.yml" (
  echo [WARN] application.yml not found in: %cd%
  echo Lavalink may start with defaults or fail to load your configuration.
  echo.
)

echo [INFO] Starting Lavalink from: %cd%
echo.

java -jar "Lavalink.jar" ^
  --spring.config.location=file:./application.yml ^
  --spring.cloud.config.enabled=false ^
  --spring.cloud.config.import-check.enabled=false

echo.
echo [INFO] Lavalink process exited with code %ERRORLEVEL%.
pause
endlocal
