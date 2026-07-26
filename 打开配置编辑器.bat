@echo off
chcp 65001 >nul
title GMGameChain Config editor Launcher

echo.
echo ============================================
echo   GMGameChain -- Config editors
echo ============================================
echo.

echo [1/2] Checking HTTP server on port 8080...

powershell -Command "if (Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo.
    echo ============================================
    echo   WARNING: No HTTP server on port 8080!
    echo.
    echo   Please start the game server first:
    echo.
    echo     npx http-server -p 8080 -c-1 --cors
    echo.
    echo   Then re-run this script.
    echo ============================================
    echo.
    pause
    exit /b 1
)

echo     OK: Server is listening on port 8080
echo.

echo [2/2] Opening config editors...

start http://127.0.0.1:8080/editor/planner-config.html
start http://127.0.0.1:8080/editor/artist-config.html
start http://127.0.0.1:8080/editor/sound-config.html

echo.
echo ============================================
echo   Opened:
echo.
echo     editor/planner-config.html  (Game Designer)
echo     editor/artist-config.html   (Artist)
echo     editor/sound-config.html    (Sound Designer)
echo.
echo   First-time use: click [Select Folder]
echo   and select the config/ folder.
echo   Edits will auto-save after that.
echo ============================================
echo.

pause
