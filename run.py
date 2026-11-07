#!/usr/bin/env python3
import os
import sys
import time
import socket
import secrets
import urllib.request
import webbrowser
import threading
from pathlib import Path
from urllib.parse import quote

if sys.version_info < (3, 11):
    print(
        "\n[ОШИБКА] Для этой версии приложения требуется Python 3.11+.\n"
        "Запустите через: py -3.14 run.py\n"
    )
    sys.exit(1)

# Add backend directory to sys.path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR / "backend"))

# Keep runtime data in the user profile, not inside the application folder.
# This keeps the library, presets and YouTube cookies across updates and
# portable launches.
def get_storage_root() -> Path:
    appdata = os.environ.get("APPDATA")
    if appdata:
        return Path(appdata) / "RPGSoundscape" / "storage"
    return Path.home() / ".rpg-soundscape" / "storage"

if not os.environ.get("RPG_DATA_DIR"):
    os.environ["RPG_DATA_DIR"] = str(get_storage_root())
API_TOKEN = os.environ.get("RPG_API_TOKEN") or secrets.token_urlsafe(32)
os.environ["RPG_API_TOKEN"] = API_TOKEN

import uvicorn

def read_running_token() -> str:
    token_file = Path(os.environ["RPG_DATA_DIR"]) / "data" / ".api_token"
    try:
        return token_file.read_text(encoding="utf-8").strip()
    except Exception:
        return ""

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(('127.0.0.1', port)) == 0

def is_app_already_running(port: int = 8000) -> bool:
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/health", headers={"User-Agent": "RPG-Launcher"})
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
            return resp.status == 200 and "RPG Music" in body
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
    # 1. Check if application is already running on port 8000.
    # Import app only after this check: importing it writes the current API
    # token and would otherwise overwrite the token of the running instance.
    if is_app_already_running(8000):
        running_token = read_running_token()
        url = (
            f"http://localhost:8000/?token={quote(running_token, safe='')}"
            if running_token
            else "http://localhost:8000"
        )
        print("\n" + "=" * 65)
        print(" 🎲 RPG SOUNDSCAPE STUDIO УЖЕ ЗАПУЩЕНА!")
        print("=" * 65)
        print(f" ▶ Приложение уже работает на {url}")
        print(" ▶ Открываем интерфейс в вашем браузере...")
        print("=" * 65 + "\n")
        webbrowser.open(url)
        sys.exit(0)

    stored_token = read_running_token()
    if stored_token:
        API_TOKEN = stored_token
        os.environ["RPG_API_TOKEN"] = API_TOKEN

    from app import get_local_ip
    local_ip = get_local_ip()

    # 2. Find available port
    target_port = find_available_port(8000)
    if target_port != 8000:
        print(f"\n[ВНИМАНИЕ] Порт 8000 занят другой программой. Используется порт {target_port}.")

    token_q = quote(API_TOKEN, safe='')
    target_url = f"http://localhost:{target_port}/?token={token_q}"
    lan_url = f"http://{local_ip}:{target_port}/?token={token_q}"

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
