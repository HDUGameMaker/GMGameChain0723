@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title GMGameChain

if not exist "%~dp0log" mkdir "%~dp0log"
set "LOG_FILE=%~dp0log\debug.log"

> "%LOG_FILE%" echo [%time%] Script started

REM ==========================================
REM  Step 1: Node.js already installed?
REM ==========================================
where node >nul 2>&1
if not errorlevel 1 (
    where npx >nul 2>&1
    if not errorlevel 1 (
        >> "%LOG_FILE%" echo [%time%] Node.js + npx found in PATH
        goto :launch
    )
)

REM Search common install directories
>> "%LOG_FILE%" echo [%time%] Searching common install dirs...
for %%d in (
    "C:\Program Files\nodejs"
    "C:\Program Files (x86)\nodejs"
    "%LOCALAPPDATA%\fnm"
    "%USERPROFILE%\.fnm"
    "%APPDATA%\npm"
) do (
    if exist %%d\node.exe (
        set "PATH=%%d;%PATH%"
        >> "%LOG_FILE%" echo [%time%] Found at %%d
    )
)

where node >nul 2>&1
if not errorlevel 1 (
    where npx >nul 2>&1
    if not errorlevel 1 goto :launch
)

REM ==========================================
REM  Step 2: Node.js NOT found - show banner
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
>> "%LOG_FILE%" echo [%time%] winget found, installing Node.js LTS...

winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
if errorlevel 1 (
    echo   winget install failed.
    >> "%LOG_FILE%" echo [%time%] winget install returned error
    goto :install_failed
)

>> "%LOG_FILE%" echo [%time%] winget install completed

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
        >> "%LOG_FILE%" echo [%time%] Found at %%d
    )
)

where node >nul 2>&1
if not errorlevel 1 (
    where npx >nul 2>&1
    if not errorlevel 1 (
        echo   Node.js installed successfully!
        >> "%LOG_FILE%" echo [%time%] Node.js OK after install
        goto :launch
    )
)

REM If we get here, install seemed to succeed but node not in PATH
echo.
echo   Installation may need a terminal restart.
echo   Please close this window and double-click again.
>> "%LOG_FILE%" echo [%time%] Node.js installed but not found in PATH
pause
exit /b 0

REM ==========================================
REM  Step 5: winget not available
REM ==========================================
:no_winget
echo   winget is not available on this system.
>> "%LOG_FILE%" echo [%time%] winget not found
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
echo     4. Double-click start_game.bat again
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
REM  LAUNCH - start the game
REM ==========================================
:launch
set "PORT=18763"

REM Stop stale game http-server instances from previous launches.
REM 8099 is the legacy port; %PORT% is the current fixed port.
>> "%LOG_FILE%" echo [%time%] Stopping stale http-server processes...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports=@(8099,%PORT%); foreach($port in $ports){ Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^node(\\.exe)?$' -and $_.CommandLine -match 'http-server' -and $_.CommandLine -match ('-p\s+' + $port + '\b') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $filter='ProcessId=' + $_.OwningProcess; $p=Get-CimInstance Win32_Process -Filter $filter -ErrorAction SilentlyContinue; if($p -and $p.Name -match '^node(\\.exe)?$' -and $p.CommandLine -match 'http-server'){ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } } }" >> "%LOG_FILE%" 2>&1

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }" >nul 2>&1
if errorlevel 1 (
    echo   Port %PORT% is still occupied by another process.
    >> "%LOG_FILE%" echo [%time%] Port %PORT% still occupied
    pause
    exit /b 1
)

echo.
echo ============================================
echo   GMGameChain - Web Game
echo ============================================
echo.
echo   Server : http://127.0.0.1:%PORT%
echo   Press  Ctrl+C to stop
echo ============================================
echo.

set "GAME_URL=http://127.0.0.1:%PORT%/?v=%RANDOM%"
start "" powershell -NoProfile -WindowStyle Hidden -Command "$u='%GAME_URL%'; for ($i=0; $i -lt 40; $i++) { try { Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 1 | Out-Null; break } catch { Start-Sleep -Milliseconds 500 } }; Start-Process $u"

>> "%LOG_FILE%" echo [%time%] Launching http-server via npx on port %PORT%...
npx --yes http-server . -p %PORT% -c-1 --cors

pause
