@echo off
chcp 65001 > nul
title RPG Soundscape Studio (Dev Mode)

echo Запуск бэкенда FastAPI и фронтенда Vite...
start cmd /k "python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload"
start cmd /k "cd frontend && npm run dev"

echo Бэкенд запущен на порту 8000, Vite dev сервер на http://localhost:5173
pause
