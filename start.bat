@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul
title RPG Soundscape Studio

:: Switch to the directory where this script is located
cd /d "%~dp0"

echo =========================================================
echo    Запуск RPG Soundscape Studio...
echo =========================================================

:: Detect Python executable
set "PY_CMD="

:: 1. Check if 'python' works in current PATH
python --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PY_CMD=python"
    goto :FOUND
)

:: 2. Check if 'py' launcher works
py -3 --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PY_CMD=py -3"
    goto :FOUND
)

:: 3. Check Miniconda in user directory
if exist "%USERPROFILE%\miniconda3\python.exe" (
    set "PY_CMD=%USERPROFILE%\miniconda3\python.exe"
    goto :FOUND
)

:: 4. Check Anaconda in user directory
if exist "%USERPROFILE%\anaconda3\python.exe" (
    set "PY_CMD=%USERPROFILE%\anaconda3\python.exe"
    goto :FOUND
)

:: 5. Check standard Python in AppData
for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
    if exist "%%D\python.exe" (
        set "PY_CMD=%%D\python.exe"
        goto :FOUND
    )
)

:FOUND
if not defined PY_CMD (
    echo.
    echo =========================================================
    echo [ОШИБКА] Интерпретатор Python не найден!
    echo =========================================================
    echo Программа не смогла обнаружить установленный Python.
    echo Пожалуйста, установите Python 3 с официального сайта python.org
    echo или убедитесь, что Miniconda/Anaconda установлена.
    echo.
    pause
    exit /b 1
)

echo [OK] Найден Python: !PY_CMD!
echo.

!PY_CMD! run.py

if %ERRORLEVEL% neq 0 (
    echo.
    echo =========================================================
    echo [ОШИБКА] Приложение завершилось с ошибкой (код %ERRORLEVEL%).
    echo =========================================================
    echo.
    pause
)
