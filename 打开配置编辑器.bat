@echo off
chcp 65001 >nul
title GMGameChain Config editor Launcher
set "PORT=18763"

echo.
echo ============================================
echo   GMGameChain -- Config editors
echo ============================================
echo.

echo [1/2] Checking HTTP server on port %PORT%...

powershell -Command "if (Get-NetTCPConnection -LocalPort %PORT% -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo.
    echo ============================================
    echo   WARNING: No HTTP server on port %PORT%!
    echo.
    echo   Please start the game server first:
    echo.
    echo     npx http-server -p %PORT% -c-1 --cors
    echo.
    echo   Then re-run this script.
    echo ============================================
    echo.
    pause
    exit /b 1
)

echo     OK: Server is listening on port %PORT%
echo.

echo [2/2] Opening config editors...

start http://127.0.0.1:%PORT%/editor/planner-config.html
start http://127.0.0.1:%PORT%/editor/artist-config.html
start http://127.0.0.1:%PORT%/editor/sound-config.html

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
