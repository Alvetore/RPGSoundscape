@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul
title RPG Soundscape Studio (Dev Mode)

:: Switch to script directory
cd /d "%~dp0"

echo =========================================================
echo    Запуск в режиме разработчика (Dev Mode)...
echo =========================================================

:: Detect Python executable
set "PY_CMD="

python --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PY_CMD=python"
    goto :DEV_FOUND
)

py -3 --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PY_CMD=py -3"
    goto :DEV_FOUND
)

if exist "%USERPROFILE%\miniconda3\python.exe" (
    set "PY_CMD=%USERPROFILE%\miniconda3\python.exe"
    goto :DEV_FOUND
)

if exist "%USERPROFILE%\anaconda3\python.exe" (
    set "PY_CMD=%USERPROFILE%\anaconda3\python.exe"
    goto :DEV_FOUND
)

:DEV_FOUND
if not defined PY_CMD (
    echo [ОШИБКА] Python не найден!
    pause
    exit /b 1
)

:: One shared API token for the FastAPI backend and the Vite proxy.
for /f "usebackq delims=" %%T in (`!PY_CMD! -c "import secrets; print(secrets.token_urlsafe(32))"`) do set "RPG_API_TOKEN=%%T"
if not defined RPG_API_TOKEN (
    echo [ОШИБКА] Не удалось сгенерировать API-токен.
    pause
    exit /b 1
)

echo Запуск бэкенда на порту 8000 и фронтенда Vite (http://localhost:5173)...
start "RPG Backend (FastAPI)" cmd /k "cd /d "%~dp0" && !PY_CMD! -m uvicorn app:app --app-dir backend --host 0.0.0.0 --port 8000 --reload"
start "RPG Frontend (Vite)" cmd /k "cd /d "%~dp0\frontend" && npm run dev"

timeout /t 2 /nobreak >nul
start "" "http://localhost:5173/?token=%RPG_API_TOKEN%"

echo.
echo Серверы запущены в отдельных окнах.
echo Для остановки закройте открывшиеся окна терминала.
echo.
pause
