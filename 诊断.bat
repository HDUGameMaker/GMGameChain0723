@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Diagnostic

> "%~dp0diag.log" echo ========== DIAGNOSTIC START ==========

REM ©¤©¤ Step 1: check Node.js ©¤©¤
>> "%~dp0diag.log" echo [Step 1] Check Node.js + npx...
where node >nul 2>&1
if errorlevel 1 (
    >> "%~dp0diag.log" echo   node: NOT FOUND
) else (
    >> "%~dp0diag.log" echo   node: FOUND
    for /f "tokens=*" %%i in ('node --version 2^>^&1') do >> "%~dp0diag.log" echo   node version: %%i
)

where npx >nul 2>&1
if errorlevel 1 (
    >> "%~dp0diag.log" echo   npx: NOT FOUND
) else (
    >> "%~dp0diag.log" echo   npx: FOUND
    for /f "tokens=*" %%i in ('npx --version 2^>^&1') do >> "%~dp0diag.log" echo   npx version: %%i
)

REM ©¤©¤ Step 2: check winget ©¤©¤
>> "%~dp0diag.log" echo [Step 2] Check winget...
where winget >nul 2>&1
if errorlevel 1 (
    >> "%~dp0diag.log" echo   winget: NOT FOUND
) else (
    >> "%~dp0diag.log" echo   winget: FOUND
    for /f "tokens=*" %%i in ('winget --version 2^>^&1') do >> "%~dp0diag.log" echo   winget version: %%i
)

REM ©¤©¤ Step 3: check PATH ©¤©¤
>> "%~dp0diag.log" echo [Step 3] Current PATH (truncated):
>> "%~dp0diag.log" echo   %PATH%

REM ©¤©¤ Step 4: try to refresh PATH from registry ©¤©¤
>> "%~dp0diag.log" echo [Step 4] Registry PATH scan...
for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do (
    >> "%~dp0diag.log" echo   System PATH: %%b
)
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do (
    >> "%~dp0diag.log" echo   User PATH: %%b
)

REM ©¤©¤ Step 5: common install dirs ©¤©¤
>> "%~dp0diag.log" echo [Step 5] Common Node.js directories:
for %%d in (
    "C:\Program Files\nodejs"
    "C:\Program Files (x86)\nodejs"
    "%LOCALAPPDATA%\fnm"
    "%USERPROFILE%\.fnm"
    "%APPDATA%\npm"
) do (
    if exist %%d\node.exe (
        >> "%~dp0diag.log" echo   EXISTS: %%d\node.exe
    ) else (
        >> "%~dp0diag.log" echo   missing: %%d
    )
)

REM ©¤©¤ Step 6: test npx http-server dry-run ©¤©¤
>> "%~dp0diag.log" echo [Step 6] npx http-server test...
where node >nul 2>&1
if not errorlevel 1 (
    where npx >nul 2>&1
    if not errorlevel 1 (
        >> "%~dp0diag.log" echo   Running: npx --yes http-server --help...
        npx --yes http-server --help >> "%~dp0diag.log" 2>&1
        >> "%~dp0diag.log" echo   npx exit code: !errorlevel!
    ) else (
        >> "%~dp0diag.log" echo   SKIP: npx not available
    )
) else (
    >> "%~dp0diag.log" echo   SKIP: node not available
)

>> "%~dp0diag.log" echo ========== DIAGNOSTIC COMPLETE ==========

echo Done. Check diag.log
pause
