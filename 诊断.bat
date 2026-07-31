@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Diagnostic

if not exist "%~dp0log" mkdir "%~dp0log"
set "LOG_FILE=%~dp0log\diag.log"

> "%LOG_FILE%" echo ========== DIAGNOSTIC START ==========

REM Step 1: check Node.js
>> "%LOG_FILE%" echo [Step 1] Check Node.js + npx...
where node >nul 2>&1
if errorlevel 1 (
    >> "%LOG_FILE%" echo   node: NOT FOUND
) else (
    >> "%LOG_FILE%" echo   node: FOUND
    for /f "tokens=*" %%i in ('node --version 2^>^&1') do >> "%LOG_FILE%" echo   node version: %%i
)

where npx >nul 2>&1
if errorlevel 1 (
    >> "%LOG_FILE%" echo   npx: NOT FOUND
) else (
    >> "%LOG_FILE%" echo   npx: FOUND
    for /f "tokens=*" %%i in ('npx --version 2^>^&1') do >> "%LOG_FILE%" echo   npx version: %%i
)

REM Step 2: check winget
>> "%LOG_FILE%" echo [Step 2] Check winget...
where winget >nul 2>&1
if errorlevel 1 (
    >> "%LOG_FILE%" echo   winget: NOT FOUND
) else (
    >> "%LOG_FILE%" echo   winget: FOUND
    for /f "tokens=*" %%i in ('winget --version 2^>^&1') do >> "%LOG_FILE%" echo   winget version: %%i
)

REM Step 3: check PATH
>> "%LOG_FILE%" echo [Step 3] Current PATH (truncated):
>> "%LOG_FILE%" echo   %PATH%

REM Step 4: try to refresh PATH from registry
>> "%LOG_FILE%" echo [Step 4] Registry PATH scan...
for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do (
    >> "%LOG_FILE%" echo   System PATH: %%b
)
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do (
    >> "%LOG_FILE%" echo   User PATH: %%b
)

REM Step 5: common install dirs
>> "%LOG_FILE%" echo [Step 5] Common Node.js directories:
for %%d in (
    "C:\Program Files\nodejs"
    "C:\Program Files (x86)\nodejs"
    "%LOCALAPPDATA%\fnm"
    "%USERPROFILE%\.fnm"
    "%APPDATA%\npm"
) do (
    if exist %%d\node.exe (
        >> "%LOG_FILE%" echo   EXISTS: %%d\node.exe
    ) else (
        >> "%LOG_FILE%" echo   missing: %%d
    )
)

REM Step 6: test npx http-server dry-run
>> "%LOG_FILE%" echo [Step 6] npx http-server test...
where node >nul 2>&1
if not errorlevel 1 (
    where npx >nul 2>&1
    if not errorlevel 1 (
        >> "%LOG_FILE%" echo   Running: npx --yes http-server --help...
        npx --yes http-server --help >> "%LOG_FILE%" 2>&1
        >> "%LOG_FILE%" echo   npx exit code: !errorlevel!
    ) else (
        >> "%LOG_FILE%" echo   SKIP: npx not available
    )
) else (
    >> "%LOG_FILE%" echo   SKIP: node not available
)

>> "%LOG_FILE%" echo ========== DIAGNOSTIC COMPLETE ==========

echo Done. Check log\diag.log
pause
