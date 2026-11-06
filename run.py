#!/usr/bin/env python3
import os
import sys
import time
import socket
import urllib.request
import webbrowser
import threading
from pathlib import Path

# Add backend directory to sys.path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR / "backend"))

import uvicorn
from app import get_local_ip

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(('127.0.0.1', port)) == 0

def is_app_already_running(port: int = 8000) -> bool:
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/health", headers={"User-Agent": "RPG-Launcher"})
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            return resp.status == 200
    except Exception:
        return False

def find_available_port(preferred_port: int = 8000, max_attempts: int = 10) -> int:
    for port in range(preferred_port, preferred_port + max_attempts):
        if not is_port_in_use(port):
            return port
    return preferred_port

def open_browser(url: str):
    time.sleep(1.2)
    print(f"\n[RPG Soundscape] Открытие браузера: {url}")
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"Не удалось открыть браузер автоматически: {e}")

if __name__ == "__main__":
    local_ip = get_local_ip()
    
    # 1. Check if application is already running on port 8000
    if is_app_already_running(8000):
        url = "http://localhost:8000"
        print("\n" + "=" * 65)
        print(" 🎲 RPG SOUNDSCAPE STUDIO УЖЕ ЗАПУЩЕНА!")
        print("=" * 65)
        print(f" ▶ Приложение уже работает на {url}")
        print(" ▶ Открываем интерфейс в вашем браузере...")
        print("=" * 65 + "\n")
        webbrowser.open(url)
        sys.exit(0)

    # 2. Find available port
    target_port = find_available_port(8000)
    if target_port != 8000:
        print(f"\n[ВНИМАНИЕ] Порт 8000 занят другой программой. Используется порт {target_port}.")

    target_url = f"http://localhost:{target_port}"
    lan_url = f"http://{local_ip}:{target_port}"

    print("\n" + "=" * 65)
    print(" 🎲 RPG SOUNDSCAPE STUDIO — ЗВУКОВОЙ ПУЛЬТ ДЛЯ НРИ")
    print("=" * 65)
    print(f" ▶ Локальный доступ (ПК):     {target_url}")
    print(f" 📱 Доступ с Android / LAN:   {lan_url}")
    print("=" * 65)
    print(" ℹ Для управления с планшета/телефона подключитесь к одному Wi-Fi")
    print("   и откройте указанный адрес в мобильном браузере.")
    print("=" * 65 + "\n")

    threading.Thread(target=open_browser, args=(target_url,), daemon=True).start()

    try:
        uvicorn.run(
            "app:app",
            host="0.0.0.0",
            port=target_port,
            app_dir=str(BASE_DIR / "backend"),
            reload=False
        )
    except Exception as e:
        print(f"\n[КРИТИЧЕСКАЯ ОШИБКА ЗАПУСКА] {e}")
        input("\nНажмите Enter для выхода...")
        sys.exit(1)
