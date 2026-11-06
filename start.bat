@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul
title RPG Soundscape Studio (Desktop)

:: Switch to script directory
cd /d "%~dp0"

echo =========================================================
echo    Запуск RPG Soundscape Studio (Desktop App)...
echo =========================================================

:: 1. Try launching native Electron desktop window
where npx >nul 2>&1
if %ERRORLEVEL% equ 0 (
    if exist "electron\main.cjs" (
        echo Запуск десктопного приложения Electron...
        npx electron electron\main.cjs
        if %ERRORLEVEL% equ 0 (
            exit /b 0
        )
    )
)

:: 2. Fallback to Python runner if Electron is not installed
echo.
echo [ИНФО] Запуск через автономный Python-сервер...

set "PY_CMD="

python --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PY_CMD=python"
    goto :RUN_PY
)

py -3 --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PY_CMD=py -3"
    goto :RUN_PY
)

if exist "%USERPROFILE%\miniconda3\python.exe" (
    set "PY_CMD=%USERPROFILE%\miniconda3\python.exe"
    goto :RUN_PY
)

if exist "%USERPROFILE%\anaconda3\python.exe" (
    set "PY_CMD=%USERPROFILE%\anaconda3\python.exe"
    goto :RUN_PY
)

for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
    if exist "%%D\python.exe" (
        set "PY_CMD=%%D\python.exe"
        goto :RUN_PY
    )
)

:RUN_PY
if not defined PY_CMD (
    echo.
    echo =========================================================
    echo [ОШИБКА] Интерпретатор Python или Node.js не найден!
    echo =========================================================
    pause
    exit /b 1
)

!PY_CMD! run.py

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ОШИБКА] Сбой при запуске приложения (код %ERRORLEVEL%).
    pause
)
