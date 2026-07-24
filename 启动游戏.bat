@echo off
setlocal enabledelapsedexpansion
cd /d "%~dp0"
title GMGameChain

> "%~dp0debug.log" echo [%time%] Script started

REM ==========================================
REM  Step 1: Node.js already installed?
REM ==========================================
where node >nul 2>&1
if not errorlevel 1 (
    where npx >nul 2>&1
    if not errorlevel 1 (
        >> "%~dp0debug.log" echo [%time%] Node.js + npx found in PATH
        goto :launch
    )
)

REM Search common install directories
>> "%~dp0debug.log" echo [%time%] Searching common install dirs...
for %%d in (
    "C:\Program Files\nodejs"
    "C:\Program Files (x86)\nodejs"
    "%LOCALAPPDATA%\fnm"
    "%USERPROFILE%\.fnm"
    "%APPDATA%\npm"
) do (
    if exist %%d\node.exe (
        set "PATH=%%d;%PATH%"
        >> "%~dp0debug.log" echo [%time%] Found at %%d
    )
)

where node >nul 2>&1
if not errorlevel 1 (
    where npx >nul 2>&1
    if not errorlevel 1 goto :launch
)

REM ==========================================
REM  Step 2: Node.js NOT found ¡ª show banner
REM ==========================================
echo.
echo ============================================
echo   GMGameChain - Web Game
echo ============================================
echo.
echo   This game requires Node.js (npx).
echo.

REM ==========================================
REM  Step 3: Try winget auto-install
REM ==========================================
where winget >nul 2>&1
if errorlevel 1 goto :no_winget

echo   Attempting automatic install via winget...
echo   (this may take a few minutes)
echo.
>> "%~dp0debug.log" echo [%time%] winget found, installing Node.js LTS...

winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
if errorlevel 1 (
    echo   winget install failed.
    >> "%~dp0debug.log" echo [%time%] winget install returned error
    goto :install_failed
)

>> "%~dp0debug.log" echo [%time%] winget install completed

REM ==========================================
REM  Step 4: Find Node.js after install
REM ==========================================
echo   Checking installation...

REM Refresh PATH from registry
for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "SysPath=%%b"
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "UserPath=%%b"
set "PATH=!SysPath!;!UserPath!;%PATH%"

REM Scan known Node.js install locations (including winget-installed)
for %%d in (
    "C:\Program Files\nodejs"
    "C:\Program Files (x86)\nodejs"
    "%LOCALAPPDATA%\Programs\nodejs"
    "%LOCALAPPDATA%\fnm"
    "%USERPROFILE%\.fnm"
) do (
    if exist %%d\node.exe (
        set "PATH=%%d;%PATH%"
        >> "%~dp0debug.log" echo [%time%] Found at %%d
    )
)

where node >nul 2>&1
if not errorlevel 1 (
    where npx >nul 2>&1
    if not errorlevel 1 (
        echo   Node.js installed successfully!
        >> "%~dp0debug.log" echo [%time%] Node.js OK after install
        goto :launch
    )
)

REM If we get here, install seemed to succeed but node not in PATH
echo.
echo   Installation may need a terminal restart.
echo   Please close this window and double-click again.
>> "%~dp0debug.log" echo [%time%] Node.js installed but not found in PATH
pause
exit /b 0

REM ==========================================
REM  Step 5: winget not available
REM ==========================================
:no_winget
echo   winget is not available on this system.
>> "%~dp0debug.log" echo [%time%] winget not found
goto :install_failed

REM ==========================================
REM  Step 6: All install methods failed
REM ==========================================
:install_failed
echo.
echo   Please install Node.js manually:
echo.
echo     1. Open: https://nodejs.org/
echo     2. Download the LTS version
echo     3. Run the installer (keep all default settings)
echo     4. Double-click Æô¶¯ÓÎÏ·.bat again
echo.
echo   (Press any key to open the download page...)
pause >nul
start "" https://nodejs.org/
echo.
echo   After installation is complete, re-run this script.
echo.
pause
exit /b 1

REM ==========================================
REM  LAUNCH ¡ª start the game
REM ==========================================
:launch
echo.
echo ============================================
echo   GMGameChain - Web Game
echo ============================================
echo.
echo   Server : http://127.0.0.1:8080
echo   Press  Ctrl+C to stop
echo ============================================
echo.

start "" http://127.0.0.1:8080

>> "%~dp0debug.log" echo [%time%] Launching http-server via npx...
npx --yes http-server . -p 8080 -c-1 --cors

pause
