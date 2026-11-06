@echo off
chcp 65001 > nul
title RPG Soundscape Studio

echo =========================================================
echo    Запуск RPG Soundscape Studio...
echo =========================================================

python run.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ОШИБКА] Не удалось запустить сервер через python run.py.
    echo Проверьте установку Python и зависимостей из backend\requirements.txt
    pause
)
