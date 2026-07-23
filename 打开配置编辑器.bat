@echo off
title GMGameChain Config Editor Launcher

echo.
echo ============================================
echo   GMGameChain -- Config Editors
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

start http://127.0.0.1:8080/planner-config.html
start http://127.0.0.1:8080/artist-config.html

echo.
echo ============================================
echo   Opened:
echo.
echo     planner-config.html  (Game Designer)
echo     artist-config.html   (Artist)
echo.
echo   First-time use: click [Xuan Ze Mu Lu]
echo   and select the config/ folder.
echo   Edits will auto-save after that.
echo ============================================
echo.

pause
