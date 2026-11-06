#!/usr/bin/env python3
import os
import sys
import time
import socket
import webbrowser
import threading
from pathlib import Path

# Add backend directory to sys.path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR / "backend"))

import uvicorn
from app import get_local_ip

def open_browser():
    time.sleep(1.2)
    url = "http://localhost:8000"
    print(f"\n[RPG Soundscape] Открытие браузера: {url}")
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"Не удалось открыть браузер автоматически: {e}")

if __name__ == "__main__":
    local_ip = get_local_ip()
    
    print("\n" + "=" * 65)
    print(" 🎲 RPG SOUNDSCAPE STUDIO — ЗВУКОВОЙ ПУЛЬТ ДЛЯ НРИ")
    print("=" * 65)
    print(f" ▶ Локальный доступ (ПК):     http://localhost:8000")
    print(f" 📱 Доступ с Android / LAN:   http://{local_ip}:8000")
    print("=" * 65)
    print(" ℹ Для управления с планшета/телефона подключитесь к одному Wi-Fi")
    print("   и откройте указанный адрес в мобильном браузере.")
    print("=" * 65 + "\n")

    threading.Thread(target=open_browser, daemon=True).start()

    # Run uvicorn server serving both API and static production frontend
    uvicorn.run("app:app", host="0.0.0.0", port=8000, app_dir=str(BASE_DIR / "backend"), reload=False)
