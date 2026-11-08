import os
import sys
import json
import uuid
import socket
import asyncio
import logging
import queue
import secrets
import shutil
import subprocess
import tempfile
import threading
import time
import zipfile
from typing import List, Optional, Dict, Any
from pathlib import Path
from datetime import datetime
from urllib.parse import quote, urlparse

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse, StreamingResponse
from pydantic import BaseModel, Field
import yt_dlp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rpg_music")

# Base paths. When packaged with PyInstaller, __file__ points into the
# temporary extraction directory, so Electron passes the real resource
# directories via environment variables.
IS_FROZEN = bool(getattr(sys, "frozen", False))
BASE_DIR = Path(
    os.environ.get("RPG_BACKEND_DIR")
    or (Path(sys.executable).resolve().parent if IS_FROZEN else Path(__file__).resolve().parent)
)
STATIC_DIR = Path(
    os.environ.get("RPG_STATIC_DIR") or (BASE_DIR.parent / "frontend" / "dist")
)

# Runtime data belongs outside the application bundle. Electron and run.py
# pass RPG_DATA_DIR so that library files, cookies and presets survive
# application updates / portable builds. Without the variable we keep the
# legacy in-project layout for direct development.
_legacy_data_dir = BASE_DIR / "data"
_legacy_library_dir = BASE_DIR / "audio_library"
_storage_root_env = os.environ.get("RPG_DATA_DIR", "").strip()
if _storage_root_env:
    STORAGE_ROOT = Path(_storage_root_env).expanduser().resolve()
else:
    STORAGE_ROOT = BASE_DIR

DATA_DIR = STORAGE_ROOT / "data"
LIBRARY_DIR = STORAGE_ROOT / "audio_library"
DATA_DIR.mkdir(parents=True, exist_ok=True)
LIBRARY_DIR.mkdir(parents=True, exist_ok=True)

AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".flac", ".m4a", ".webm", ".aac", ".opus"}
MAX_UPLOAD_BYTES = int(os.environ.get("RPG_MAX_UPLOAD_MB", "500")) * 1024 * 1024
YT_START_TIMEOUT_SEC = int(os.environ.get("RPG_YT_START_TIMEOUT_SEC", "45"))

def _copy_file_atomic(src: Path, dst: Path):
    """Copy a file without leaving a partially written destination on crash."""
    temp_dst = dst.with_name(f".{dst.name}.migrating")
    shutil.copy2(src, temp_dst)
    os.replace(temp_dst, dst)

def migrate_legacy_storage():
    """Move data created by older in-project builds into RPG_DATA_DIR once."""
    if STORAGE_ROOT.resolve() == BASE_DIR.resolve():
        return

    marker = STORAGE_ROOT / ".storage_initialized"
    if marker.exists():
        return

    for name in ("library.json", "presets.json", "settings.json", "cookies.txt"):
        src = _legacy_data_dir / name
        dst = DATA_DIR / name
        if src.is_file() and not dst.exists():
            try:
                _copy_file_atomic(src, dst)
                logger.info(f"Migrated legacy data file: {name}")
            except Exception as e:
                logger.warning(f"Could not migrate {src}: {e}")

    if _legacy_library_dir.is_dir():
        for src in _legacy_library_dir.iterdir():
            if not src.is_file() or src.suffix.lower() not in AUDIO_EXTENSIONS:
                continue
            dst = LIBRARY_DIR / src.name
            if not dst.exists():
                try:
                    _copy_file_atomic(src, dst)
                except Exception as e:
                    logger.warning(f"Could not migrate audio file {src.name}: {e}")

    try:
        marker.write_text(datetime.now().isoformat(), encoding="utf-8")
    except Exception as e:
        logger.warning(f"Could not write storage marker: {e}")

migrate_legacy_storage()

METADATA_FILE = DATA_DIR / "library.json"
PRESETS_FILE = DATA_DIR / "presets.json"
SETTINGS_FILE = DATA_DIR / "settings.json"
COOKIES_FILE = DATA_DIR / "cookies.txt"
API_TOKEN_FILE = DATA_DIR / ".api_token"

# LAN clients must present this token. Local desktop access is also token
# protected, so a random website cannot drive-by control the localhost API.
API_TOKEN = os.environ.get("RPG_API_TOKEN", "").strip() or secrets.token_urlsafe(32)
API_TOKEN_COOKIE = "rpg_api_token"
try:
    API_TOKEN_FILE.write_text(API_TOKEN, encoding="utf-8")
    if os.name != "nt":
        os.chmod(API_TOKEN_FILE, 0o600)
except Exception as e:
    logger.warning(f"Could not persist API token: {e}")

app = FastAPI(title="RPG Music & Ambience Studio", version="1.0.0")

def _request_token(request: Request) -> str:
    return (
        request.headers.get("x-rpg-token")
        or request.query_params.get("token")
        or request.cookies.get(API_TOKEN_COOKIE)
        or ""
    ).strip()

def _is_token_valid(token: str) -> bool:
    return bool(token) and secrets.compare_digest(token, API_TOKEN)

@app.middleware("http")
async def token_auth_middleware(request: Request, call_next):
    path = request.url.path
    supplied_token = _request_token(request)
    authorized = _is_token_valid(supplied_token)

    protected = (
        path.startswith("/api/")
        or path in ("/", "/index.html", "/openapi.json")
        or path.startswith("/docs")
        or path.startswith("/redoc")
    )

    if protected and not authorized:
        if path in ("/", "/index.html"):
            return HTMLResponse(
                "<!doctype html><html lang='ru'><meta charset='utf-8'>"
                "<title>RPG Soundscape Studio — требуется доступ</title>"
                "<body style='font-family:sans-serif;background:#0c0e14;color:#e2e8f0;padding:40px'>"
                "<h1>Требуется доступ</h1>"
                "<p>Откройте приложение по ссылке с токеном из QR-кода или из консоли запуска.</p>"
                "<p style='color:#94a3b8'>Например: <code>http://IP:8000/?token=...</code></p>"
                "</body></html>",
                status_code=401,
            )
        return JSONResponse({"detail": "Unauthorized"}, status_code=401)

    response = await call_next(request)
    # Do not leak the ?token=... URL to external font/thumbnail requests.
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    if authorized:
        response.set_cookie(
            API_TOKEN_COOKIE,
            API_TOKEN,
            max_age=7 * 24 * 60 * 60,
            httponly=True,
            samesite="lax",
        )
    return response

class PlaybackHub:
    """Relays commands from LAN remotes to the authoritative desktop player."""

    def __init__(self):
        self.host: Optional[WebSocket] = None
        self.remotes: List[WebSocket] = []
        self.last_state: Optional[Dict[str, Any]] = None
        self.lock = asyncio.Lock()

    async def _send(self, websocket: WebSocket, payload: Dict[str, Any]) -> bool:
        try:
            await websocket.send_text(json.dumps(payload, ensure_ascii=False))
            return True
        except Exception:
            return False

    async def set_host(self, websocket: WebSocket):
        async with self.lock:
            old_host = self.host
            self.host = websocket
        if old_host is not None and old_host is not websocket:
            try:
                await old_host.close(code=4000, reason="Replaced by another host")
            except Exception:
                pass
        if self.last_state is not None:
            await self._send(websocket, {"type": "state", "state": self.last_state})
        await self._broadcast_host_status(True)

    async def remove_host(self, websocket: WebSocket):
        removed = False
        async with self.lock:
            if self.host is websocket:
                self.host = None
                removed = True
        if removed:
            await self._broadcast_host_status(False)

    async def add_remote(self, websocket: WebSocket):
        async with self.lock:
            if websocket not in self.remotes:
                self.remotes.append(websocket)
        if self.last_state is not None:
            await self._send(websocket, {"type": "state", "state": self.last_state})
        await self._send(websocket, {"type": "host_status", "connected": self.host is not None})

    async def remove_remote(self, websocket: WebSocket):
        async with self.lock:
            if websocket in self.remotes:
                self.remotes.remove(websocket)

    async def _broadcast_host_status(self, connected: bool):
        payload = {"type": "host_status", "connected": connected}
        for remote in list(self.remotes):
            if not await self._send(remote, payload):
                await self.remove_remote(remote)

    async def publish_state(self, state: Dict[str, Any]):
        self.last_state = state
        payload = {"type": "state", "state": state}
        for remote in list(self.remotes):
            if not await self._send(remote, payload):
                await self.remove_remote(remote)

    async def forward_command(self, origin: WebSocket, command: Dict[str, Any]):
        host = self.host
        if host is None:
            await self._send(origin, {"type": "error", "message": "Desktop host is not connected"})
            return
        if not await self._send(host, {"type": "command", "command": command}):
            removed = False
            async with self.lock:
                if self.host is host:
                    self.host = None
                    removed = True
            await self._send(origin, {"type": "error", "message": "Desktop host disconnected"})
            if removed:
                await self._broadcast_host_status(False)


playback_hub = PlaybackHub()

# Active download tasks dictionary: task_id -> status dict
download_tasks: Dict[str, Dict[str, Any]] = {}
download_task_timestamps: Dict[str, float] = {}
active_download_processes: Dict[str, subprocess.Popen] = {}

def cleanup_stale_download_tasks(max_age_sec: int = 3600):
    """Drop finished task records that nobody has polled for an hour."""
    now = time.time()
    stale = [
        task_id
        for task_id, updated_at in download_task_timestamps.items()
        if now - updated_at > max_age_sec and task_id not in active_download_processes
    ]
    for task_id in stale:
        download_tasks.pop(task_id, None)
        download_task_timestamps.pop(task_id, None)

def kill_process_tree(pid: int):
    """Instantly kills a process and all its children across Windows/Linux."""
    try:
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/pid", str(pid), "/f", "/t"], capture_output=True, timeout=2)
        else:
            os.kill(pid, 9)
    except Exception as e:
        logger.warning(f"Error terminating process {pid}: {e}")

def get_local_ip() -> str:
    """Detect LAN IP address for cross-device / Android connection."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

def load_json(file_path: Path, default_val: Any) -> Any:
    if file_path.exists():
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error reading {file_path}: {e}")
    return default_val

_JSON_WRITE_LOCK = threading.Lock()
# Serializes read-modify-write cycles on metadata/presets. Without it an
# upload completing at the same time as a download can silently lose a track.
_DATA_LOCK = threading.RLock()

def save_json(file_path: Path, data: Any):
    # Unique temp names avoid collisions when an upload, a download worker and
    # a preset save try to write metadata at the same time.
    temp_file = file_path.with_name(f".{file_path.name}.{uuid.uuid4().hex}.tmp")
    try:
        with _JSON_WRITE_LOCK:
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(temp_file, file_path)
    finally:
        if temp_file.exists():
            try:
                temp_file.unlink()
            except Exception:
                pass

def get_settings() -> Dict[str, Any]:
    with _DATA_LOCK:
        return load_json(SETTINGS_FILE, {"cookie_source": "auto"})

def save_settings(settings: Dict[str, Any]):
    with _DATA_LOCK:
        save_json(SETTINGS_FILE, settings)

def sync_library_with_disk():
    """Ensure all audio files in LIBRARY_DIR are registered in library.json."""
    with _DATA_LOCK:
        data = load_json(METADATA_FILE, {"tracks": []})
        existing_files = {t["filename"] for t in data["tracks"]}

        valid_extensions = AUDIO_EXTENSIONS
        modified = False

        # Check for orphaned records
        tracks_to_keep = []
        for t in data["tracks"]:
            if (LIBRARY_DIR / t["filename"]).exists():
                tracks_to_keep.append(t)
            else:
                modified = True
        data["tracks"] = tracks_to_keep

        # Add loose audio files found on disk
        for file in LIBRARY_DIR.iterdir():
            if file.is_file() and file.suffix.lower() in valid_extensions and file.name not in existing_files:
                file_id = str(uuid.uuid4())
                stat = file.stat()
                title = file.stem.replace("_", " ").title()
                data["tracks"].append({
                    "id": file_id,
                    "title": title,
                    "filename": file.name,
                    "duration": 0,
                    "category": "General",
                    "tags": ["local"],
                    "source": "local",
                    "filesize": stat.st_size,
                    "date_added": datetime.now().isoformat()
                })
                modified = True

        if modified or not METADATA_FILE.exists():
            save_json(METADATA_FILE, data)
        return data

# Initialize library on startup
sync_library_with_disk()

def inspect_cookie_file(file_path: Path) -> Dict[str, Any]:
    """Analyzes cookies.txt to determine if authentic Google/YouTube session cookies are present."""
    if not file_path.exists() or file_path.stat().st_size <= 10:
        return {
            "has_cookies_file": False,
            "is_authenticated": False,
            "has_login_info": False,
            "file_size": 0,
            "cookie_count": 0,
            "warning": None,
            "auth_status": "none"
        }
    
    file_size = file_path.stat().st_size
    lines_count = 0
    has_login_info = False
    has_sid = False
    has_ssid = False
    has_secure_sid = False
    has_youtube_domain = False
    
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                # Netscape-format exports mark HttpOnly cookies with a
                # "#HttpOnly_" domain prefix. The auth cookies we care about
                # (LOGIN_INFO, SID, SSID) are HttpOnly, so they must not be
                # skipped together with regular comment lines.
                if line.startswith("#HttpOnly_"):
                    line = line[len("#HttpOnly_"):]
                elif line.startswith("#"):
                    continue
                parts = line.split("\t")
                lines_count += 1
                if len(parts) >= 6:
                    domain = parts[0].lower()
                    name = parts[5].strip()
                    if "youtube.com" in domain or "google.com" in domain:
                        has_youtube_domain = True
                    if name == "LOGIN_INFO":
                        has_login_info = True
                    elif name == "SID":
                        has_sid = True
                    elif name == "SSID":
                        has_ssid = True
                    elif "__Secure-3PSID" in name or "__Secure-1PSID" in name:
                        has_secure_sid = True
    except Exception as e:
        logger.warning(f"Error inspecting cookies file: {e}")
        
    is_authenticated = has_login_info or (has_sid and has_ssid)
    
    warning = None
    auth_status = "valid" if is_authenticated else "missing_auth"
    
    if not has_youtube_domain:
        warning = "Файл не содержит cookies для домена youtube.com или google.com."
        auth_status = "missing_auth"
    elif not is_authenticated:
        if has_secure_sid and not has_login_info:
            warning = (
                "Внимание: файл содержит только базовые маркеры Google, но в нем отсутствует ключевой токен LOGIN_INFO. "
                "YouTube не считает эту сессию авторизованной. Экспортируйте cookies со страницы youtube.com, "
                "убедившись, что вы залогинены в аккаунт и в расширении включен экспорт HttpOnly cookies."
            )
        else:
            warning = (
                "В файле отсутствует токен авторизации (LOGIN_INFO / SID). "
                "Сессия считается анонимной и YouTube может заблокировать скачивание. "
                "Убедитесь, что вы авторизованы на youtube.com перед экспортом."
            )
            
    return {
        "has_cookies_file": True,
        "is_authenticated": is_authenticated,
        "has_login_info": has_login_info,
        "file_size": file_size,
        "cookie_count": lines_count,
        "warning": warning,
        "auth_status": auth_status
    }

# Initial presets if empty
def init_default_presets():
    presets = load_json(PRESETS_FILE, [])
    if not presets:
        default_presets = [
            {
                "id": "preset-forest-camp",
                "name": "Ночной лагерь в глуши",
                "description": "Треск костра, ночной ветер и мистическая тишина перед броском инициативы",
                "category": "Wilderness",
                "icon": "flame",
                "slots": [
                    {"slotIndex": 0, "title": "Костёр (Campfire Crackles)", "filename": "campfire_crackles.wav", "volume": 0.65, "loop": True, "active": True},
                    {"slotIndex": 1, "title": "Магический звон (Mystic Chimes)", "filename": "mystic_chimes.wav", "volume": 0.35, "loop": True, "active": True}
                ]
            },
            {
                "id": "preset-dungeon-depths",
                "name": "Катакомбы ужаса",
                "description": "Глубокий гул темных залов и холодный подземный сквозняк",
                "category": "Dungeon",
                "icon": "skull",
                "slots": [
                    {"slotIndex": 0, "title": "Эхо катакомб (Dungeon Abyss)", "filename": "dungeon_abyss.wav", "volume": 0.70, "loop": True, "active": True},
                    {"slotIndex": 1, "title": "Магический звон (Mystic Chimes)", "filename": "mystic_chimes.wav", "volume": 0.40, "loop": True, "active": True}
                ]
            },
            {
                "id": "preset-rain-sanctuary",
                "name": "Убежище под ливнем",
                "description": "Шум бушующего снаружи шторма и тепло очага внутри",
                "category": "Weather",
                "icon": "beer",
                "slots": [
                    {"slotIndex": 0, "title": "Ливень с громом (Rain Storm)", "filename": "rain_storm.wav", "volume": 0.60, "loop": True, "active": True},
                    {"slotIndex": 1, "title": "Костёр (Campfire Crackles)", "filename": "campfire_crackles.wav", "volume": 0.50, "loop": True, "active": True}
                ]
            }
        ]
        save_json(PRESETS_FILE, default_presets)

init_default_presets()

# --- Helpers for YouTube Options and Error Translation ---

def build_ydl_opts(for_download: bool = False, custom_browser: Optional[str] = None) -> Dict[str, Any]:
    """Constructs resilient yt-dlp options supporting cookies, fallback clients, and ffmpeg."""
    import shutil
    settings = get_settings()
    cookie_source = custom_browser or settings.get("cookie_source", "auto")

    opts: Dict[str, Any] = {
        'quiet': True,
        'no_warnings': True,
        'socket_timeout': 15,
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        }
    }

    # 1. Cookie file check (cookies.txt) - isolated temporary copy to prevent yt-dlp from mutating original
    if (cookie_source in ("auto", "file")) and COOKIES_FILE.exists() and COOKIES_FILE.stat().st_size > 10:
        temp_cookies = DATA_DIR / f"temp_session_{uuid.uuid4().hex[:6]}.txt"
        try:
            shutil.copyfile(COOKIES_FILE, temp_cookies)
            opts['cookiefile'] = str(temp_cookies)
        except Exception as e:
            logger.warning(f"Could not create safe cookie session copy: {e}")
            opts['cookiefile'] = str(COOKIES_FILE)
    elif cookie_source in ("chrome", "firefox", "edge", "opera", "brave", "vivaldi"):
        try:
            opts['cookiesfrombrowser'] = (cookie_source,)
        except Exception as e:
            logger.warning(f"Could not configure cookiesfrombrowser for {cookie_source}: {e}")

    if not for_download:
        opts['skip_download'] = True
    else:
        # Flexible audio format selector with fallbacks:
        # 1. Best standalone audio (ba)
        # 2. Any standalone audio (ba*)
        # 3. Best combined video+audio (b)
        # 4. Any combined video+audio (b*)
        # 5. Best available or worst available (any stream with audio)
        opts['format'] = 'ba/ba*/b/b*/best/worst'

    return opts

def translate_yt_error(err_str: str) -> str:
    """Translates technical yt-dlp / YouTube errors into clear, actionable advice."""
    lower = err_str.lower()
    if "proxy fallback" in lower:
        return (
            "YouTube заблокировал прямое скачивание, внешний Cobalt-загрузчик и резервные прокси не смогли получить файл. "
            "Попробуйте ещё раз через несколько минут, задайте рабочий прокси в RPG_YTDL_PROXIES "
            "или перетащите MP3-файл в окно программы вручную."
        )
    if "cobalt fallback" in lower:
        return (
            "YouTube заблокировал прямое скачивание, и внешний резервный загрузчик не смог получить файл. "
            "Попробуйте ещё раз через несколько минут, смените VPN/сеть или перетащите MP3-файл "
            "в окно программы вручную."
        )
    if (
        "downloaded file is empty" in lower
        or "unable to download video data" in lower
        or "http error 403" in lower
        or "no video formats found" in lower
    ):
        return (
            "YouTube отдал информацию о видео, но заблокировал сам медиапоток (403/пустой ответ). "
            "Обычно это связано с VPN/прокси, IP-адресом или PO Token. "
            "Отключите VPN/смените сеть, обновите cookies или перетащите MP3-файл "
            "в окно программы вручную."
        )
    if "sign in to confirm you’re not a bot" in lower or "sign in to confirm" in lower:
        return (
            "YouTube заблокировал прямое скачивание защитой Google BotGuard (требуется PO Token). "
            "Попробуйте отключить VPN/прокси или сменить сеть, заново экспортировать cookies "
            "или перетащить MP3-файл в окно программы вручную."
        )
    elif "requested format is not available" in lower:
        return (
            "Запрошенный аудиоформат оказался временно недоступен на серверах YouTube. "
            "Попробуйте запустить скачивание повторно — система автоматически переключится на комбинированный поток (MP3)."
        )
    elif "the page needs to be reloaded" in lower:
        return (
            "Сессия YouTube в браузере устарела или страница требует перезагрузки. "
            "Рекомендуется обновить страницу в браузере или загрузить файл напрямую."
        )
    elif "video unavailable" in lower:
        return "Данное видео недоступно на YouTube (удалено, заблокировано в регионе или является приватным)."
    elif "could not copy chrome cookie database" in lower or "database is locked" in lower or "failed to decrypt with dpapi" in lower:
        return (
            "Браузер защитил свою базу cookies (защита App-Bound Encryption или база заблокирована открытым браузером). "
            "Пожалуйста, экспортируйте файл cookies.txt через расширение или перетащите скачанный трек в окно приложения."
        )
    elif "timed out" in lower or "timeout" in lower:
        return "Превышено время ожидания ответа от сервера YouTube. Возможно, канал связи заблокирован или замедлен провайдером."
    return err_str

def validate_video_url(url: str) -> str:
    value = (url or "").strip()
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(
            status_code=400,
            detail="Некорректная ссылка. Поддерживаются только http/https URL.",
        )
    return value

# --- Models ---
class TrackUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None

class PresetSlotModel(BaseModel):
    slotIndex: int = Field(ge=0, le=15)
    trackId: Optional[str] = None
    title: Optional[str] = None
    # Saved scenes must keep the audio filename. Without it a preset created
    # from the UI cannot be restored after a restart or transferred to a phone.
    filename: Optional[str] = None
    volume: float = Field(0.7, ge=0.0, le=1.0)
    loop: bool = True
    active: bool = False
    pan: float = Field(0.0, ge=-1.0, le=1.0)
    playbackRate: float = Field(1.0, ge=0.25, le=4.0)

class PresetModel(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    category: Optional[str] = "Custom"
    icon: Optional[str] = "bookmark"
    slots: List[PresetSlotModel]

class YoutubeDownloadRequest(BaseModel):
    url: str
    title: Optional[str] = None
    category: Optional[str] = "General"
    tags: Optional[List[str]] = []
    browser_cookies: Optional[str] = None

class CookieModeRequest(BaseModel):
    mode: str

# --- API Endpoints ---

@app.get("/health")
def health_check():
    return {"status": "ok", "app": "RPG Music & Ambience Studio"}

@app.get("/api/info")
def get_info(request: Request):
    ip = get_local_ip()
    port = request.url.port or int(os.environ.get("PORT", 8000))
    token = quote(API_TOKEN, safe="")
    return {
        "status": "online",
        "app": "RPG Music & Ambience Studio",
        "version": "1.1.1",
        "lan_ip": ip,
        "access_url": f"http://{ip}:{port}/?token={token}&role=remote",
        # The Android app scans this URL to start a full library transfer.
        # Audio files are sent over the local Wi-Fi connection; the QR code
        # only carries the pairing token and endpoint.
        "transfer_url": f"http://{ip}:{port}/api/library/export?token={token}&transfer=library",
        "requires_token": True,
    }

@app.get("/api/library")
def get_library():
    data = sync_library_with_disk()
    return data["tracks"]

@app.get("/api/library/export")
def export_library():
    """Stream the whole library (metadata, presets and audio) as a ZIP.

    The Android app scans a QR code that points to this endpoint, then
    downloads the archive over the local Wi-Fi network and imports it into
    its offline library.
    """
    data = sync_library_with_disk()
    tracks = data.get("tracks", [])
    presets = load_json(PRESETS_FILE, [])
    library_root = LIBRARY_DIR.resolve()

    export_file = tempfile.SpooledTemporaryFile(max_size=64 * 1024 * 1024, mode="w+b")
    included = []
    for track in tracks:
        filename = str(track.get("filename") or "")
        if not filename:
            continue
        try:
            file_path = (library_root / filename).resolve()
        except Exception:
            continue
        if file_path.is_relative_to(library_root) and file_path.is_file():
            included.append((file_path, f"audio/{file_path.name}"))

    manifest = {
        "format": "rpg-soundscape-library",
        "version": 1,
        "exported_at": datetime.now().isoformat(),
        "tracks": len(included),
        "presets": len(presets),
    }

    with zipfile.ZipFile(export_file, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        archive.writestr("library.json", json.dumps(tracks, ensure_ascii=False, indent=2))
        archive.writestr("presets.json", json.dumps(presets, ensure_ascii=False, indent=2))
        for file_path, archive_name in included:
            # Audio is already compressed; storing it avoids a pointless
            # CPU-heavy deflate pass over hundreds of megabytes.
            archive.write(file_path, archive_name, compress_type=zipfile.ZIP_STORED)

    size = export_file.tell()
    export_file.seek(0)

    headers = {
        "Content-Disposition": 'attachment; filename="rpg_soundscape_library.zip"',
        "Content-Length": str(size),
        "Cache-Control": "no-store",
        "X-RPG-Tracks": str(len(included)),
    }

    def iter_archive():
        try:
            while True:
                chunk = export_file.read(1024 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            export_file.close()

    return StreamingResponse(iter_archive(), media_type="application/zip", headers=headers)

@app.get("/api/library/{track_id}")
def get_track_info(track_id: str):
    data = sync_library_with_disk()
    for t in data["tracks"]:
        if t["id"] == track_id:
            return t
    raise HTTPException(status_code=404, detail="Track not found")

@app.put("/api/library/{track_id}")
def update_track(track_id: str, payload: TrackUpdate):
    with _DATA_LOCK:
        data = load_json(METADATA_FILE, {"tracks": []})
        found = False
        for t in data["tracks"]:
            if t["id"] == track_id:
                if payload.title is not None:
                    t["title"] = payload.title
                if payload.category is not None:
                    t["category"] = payload.category
                if payload.tags is not None:
                    t["tags"] = payload.tags
                found = True
                break
        if not found:
            raise HTTPException(status_code=404, detail="Track not found")
        save_json(METADATA_FILE, data)
        return {"status": "success"}

@app.delete("/api/library/{track_id}")
def delete_track(track_id: str):
    with _DATA_LOCK:
        data = load_json(METADATA_FILE, {"tracks": []})
        target_filename = None
        new_tracks = []
        for t in data["tracks"]:
            if t["id"] == track_id:
                target_filename = t["filename"]
            else:
                new_tracks.append(t)

        if not target_filename:
            raise HTTPException(status_code=404, detail="Track not found")

        library_root = LIBRARY_DIR.resolve()
        try:
            file_path = (library_root / target_filename).resolve()
        except Exception:
            file_path = None
        if (
            file_path is not None
            and file_path.is_relative_to(library_root)
            and file_path.is_file()
        ):
            try:
                os.remove(file_path)
            except Exception as e:
                logger.error(f"Failed to delete file {file_path}: {e}")
                raise HTTPException(
                    status_code=500,
                    detail="Не удалось удалить аудиофайл. Возможно, он сейчас воспроизводится.",
                )
        data["tracks"] = new_tracks
        save_json(METADATA_FILE, data)
        return {"status": "deleted"}

@app.get("/api/audio/{filename}")
async def stream_audio(filename: str):
    """Serve offline audio file with full streaming range support."""
    library_root = LIBRARY_DIR.resolve()
    try:
        file_path = (library_root / filename).resolve()
    except Exception:
        raise HTTPException(status_code=404, detail="Audio file not found")

    # Never allow absolute paths, backslash traversal or symlinks escaping
    # the library directory. Without this check Windows accepts
    # "..\..\package.json" and even "C:\Windows\win.ini".
    if not file_path.is_relative_to(library_root) or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    media_type = "audio/mpeg"
    suffix = file_path.suffix.lower()
    if suffix in (".ogg", ".opus"):
        media_type = "audio/ogg"
    elif suffix == ".wav":
        media_type = "audio/wav"
    elif suffix in (".m4a", ".aac"):
        media_type = "audio/mp4"
    elif suffix == ".webm":
        media_type = "audio/webm"
    elif suffix == ".flac":
        media_type = "audio/flac"
        
    # Do not set Content-Disposition: attachment; audio elements must play
    # the stream inline instead of triggering a download.
    return FileResponse(path=file_path, media_type=media_type)

@app.post("/api/upload")
async def upload_audio(file: UploadFile = File(...), category: str = Form("Local"), tags: str = Form("")):
    """Allow user to drag & drop or upload local audio files."""
    file_id = str(uuid.uuid4())
    suffix = Path(file.filename).suffix.lower()
    if suffix not in AUDIO_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported audio format")
    
    safe_filename = f"{file_id}{suffix}"
    destination = LIBRARY_DIR / safe_filename

    # Stream to disk instead of loading a potentially huge upload into RAM.
    total_size = 0
    try:
        with open(destination, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Файл превышает лимит {MAX_UPLOAD_BYTES // (1024 * 1024)} MB",
                    )
                f.write(chunk)
        if total_size == 0:
            raise HTTPException(status_code=400, detail="Пустой аудиофайл")
    except HTTPException:
        destination.unlink(missing_ok=True)
        raise
    except Exception:
        destination.unlink(missing_ok=True)
        raise

    tag_list = [t.strip() for t in tags.split(",") if t.strip()]
    if "local" not in tag_list:
        tag_list.append("local")
        
    title = Path(file.filename).stem.replace("_", " ").title()
    
    track_item = {
        "id": file_id,
        "title": title,
        "filename": safe_filename,
        "duration": 0,
        "category": category,
        "tags": tag_list,
        "source": "upload",
        "filesize": total_size,
        "date_added": datetime.now().isoformat()
    }
    
    with _DATA_LOCK:
        data = load_json(METADATA_FILE, {"tracks": []})
        data["tracks"].append(track_item)
        save_json(METADATA_FILE, data)

    return track_item

# --- Cookie Management Endpoints ---

@app.get("/api/youtube/cookies")
def get_cookie_status():
    settings = get_settings()
    info = inspect_cookie_file(COOKIES_FILE)
    info["cookie_source"] = settings.get("cookie_source", "auto")
    info["available_browsers"] = ["auto", "file", "chrome", "firefox", "edge", "opera", "brave", "vivaldi", "none"]
    return info

@app.post("/api/youtube/cookies")
async def upload_cookies_file(file: UploadFile = File(...)):
    """Upload Netscape-format cookies.txt to authenticate yt-dlp against YouTube bot-checks."""
    content = await file.read()
    if len(content) < 10:
        raise HTTPException(status_code=400, detail="Файл cookies пустой")
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Файл cookies слишком большой")

    temp_file = COOKIES_FILE.with_name(f".{COOKIES_FILE.name}.{uuid.uuid4().hex}.tmp")
    try:
        with open(temp_file, "wb") as f:
            f.write(content)
        os.replace(temp_file, COOKIES_FILE)
    finally:
        if temp_file.exists():
            temp_file.unlink(missing_ok=True)

    settings = get_settings()
    settings["cookie_source"] = "auto"
    save_settings(settings)
    info = inspect_cookie_file(COOKIES_FILE)
    return {"status": "saved", "size": len(content), **info}

@app.delete("/api/youtube/cookies")
def delete_cookies_file():
    if COOKIES_FILE.exists():
        try:
            os.remove(COOKIES_FILE)
        except Exception as e:
            logger.error(f"Error removing cookies file: {e}")
    return {"status": "deleted"}

@app.post("/api/youtube/cookies/mode")
def update_cookie_mode(req: CookieModeRequest):
    settings = get_settings()
    settings["cookie_source"] = req.mode
    save_settings(settings)
    return {"status": "updated", "mode": req.mode}

# --- YouTube Download Processing ---

@app.post("/api/youtube/info")
async def get_youtube_info(payload: dict):
    """Retrieve metadata about a YouTube video without downloading."""
    url = validate_video_url(payload.get("url", ""))
    browser = payload.get("browser")

    session_file = None
    try:
        opts = build_ydl_opts(for_download=False, custom_browser=browser)
        session_file = opts.get('cookiefile')
        def extract():
            with yt_dlp.YoutubeDL(opts) as ydl:
                return ydl.extract_info(url, download=False)
        info = await asyncio.to_thread(extract)
        return {
            "title": info.get("title", ""),
            "duration": info.get("duration", 0),
            "uploader": info.get("uploader", ""),
            "thumbnail": info.get("thumbnail", ""),
            "id": info.get("id", "")
        }
    except Exception as e:
        err_msg = str(e)
        logger.error(f"Error fetching YT info: {err_msg}")
        user_friendly = translate_yt_error(err_msg)
        raise HTTPException(status_code=400, detail=user_friendly)
    finally:
        if session_file and "temp_session_" in session_file and os.path.exists(session_file):
            try:
                os.remove(session_file)
            except Exception:
                pass

def run_yt_download(task_id: str, url: str, custom_title: Optional[str], category: str, tags: List[str], browser: Optional[str] = None):
    """Background worker executing yt_worker in an isolated, cancelable child process."""
    file_id = str(uuid.uuid4())

    worker_exe = os.environ.get("RPG_YT_WORKER_EXE", "").strip()
    if worker_exe and Path(worker_exe).is_file():
        worker_cmd = [worker_exe]
    elif IS_FROZEN:
        bundled_worker = BASE_DIR.parent / "backend-dist" / "rpg_yt_worker.exe"
        if bundled_worker.is_file():
            worker_cmd = [str(bundled_worker)]
        else:
            logger.error(f"Bundled yt_worker not found: {bundled_worker}")
            download_tasks[task_id] = {
                "status": "error",
                "error": "В сборке отсутствует yt_worker.exe. Переустановите приложение.",
            }
            return
    else:
        worker_cmd = [sys.executable, str(BASE_DIR / "yt_worker.py")]

    cmd = worker_cmd + [
        "--url", url,
        "--file-id", file_id,
        "--library-dir", str(LIBRARY_DIR),
        "--category", category or "YouTube",
        "--tags", ",".join(tags) if tags else "",
    ]
    if custom_title:
        cmd.extend(["--title", custom_title])

    settings = get_settings()
    cookie_source = browser or settings.get("cookie_source", "auto")

    if (cookie_source in ("auto", "file")) and COOKIES_FILE.exists() and COOKIES_FILE.stat().st_size > 10:
        cmd.extend(["--cookies-file", str(COOKIES_FILE)])
    elif cookie_source in ("chrome", "firefox", "edge", "opera", "brave", "vivaldi"):
        cmd.extend(["--browser", cookie_source])

    logger.info(f"Spawning yt_worker for task {task_id}")

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            cwd=str(BASE_DIR)
        )
        active_download_processes[task_id] = proc
    except Exception as e:
        logger.error(f"Failed to spawn yt_worker process: {e}")
        download_tasks[task_id] = {
            "status": "error",
            "error": f"Не удалось запустить процесс загрузки: {e}"
        }
        return

    start_time = datetime.now()
    has_started_download = False

    # Read the worker's stdout in a separate thread. The previous
    # "for line in proc.stdout" loop could block forever, which meant the
    # 20-second watchdog never ran when yt-dlp/Chrome cookies hung silently.
    line_queue: "queue.Queue[Optional[str]]" = queue.Queue()

    def _read_worker_output():
        try:
            if proc.stdout:
                for raw_line in proc.stdout:
                    line_queue.put(raw_line)
        finally:
            line_queue.put(None)

    threading.Thread(target=_read_worker_output, daemon=True).start()

    try:
        while True:
            # Check for cancellation even while the worker prints nothing.
            if download_tasks.get(task_id, {}).get("cancelled"):
                logger.info(f"Task {task_id} cancellation detected, killing worker PID {proc.pid}")
                kill_process_tree(proc.pid)
                break

            try:
                line = line_queue.get(timeout=0.5)
            except queue.Empty:
                line = ""

            if line is None:
                break

            line = line.strip()
            if line:
                if line.startswith("RPGPROGRESS:"):
                    try:
                        payload = json.loads(line[len("RPGPROGRESS:"):])
                        status = payload.get("status")
                        if status == "downloading":
                            has_started_download = True
                        download_tasks[task_id].update(payload)
                    except Exception:
                        pass

                elif line.startswith("RPGSUCCESS:"):
                    try:
                        new_track = json.loads(line[len("RPGSUCCESS:"):])
                        new_track["date_added"] = datetime.now().isoformat()

                        with _DATA_LOCK:
                            data = load_json(METADATA_FILE, {"tracks": []})
                            data["tracks"].append(new_track)
                            save_json(METADATA_FILE, data)

                        download_tasks[task_id] = {
                            "status": "completed",
                            "percent": 100,
                            "track": new_track
                        }
                    except Exception as e:
                        logger.error(f"Error saving track metadata: {e}")
                    break

                elif line.startswith("RPGERROR:"):
                    err_msg = line[len("RPGERROR:"):].strip()
                    logger.error(f"Worker reported error: {err_msg}")
                    download_tasks[task_id] = {
                        "status": "error",
                        "error": translate_yt_error(err_msg)
                    }
                    break

            # Timeout check runs independently of worker output.
            if not has_started_download and (datetime.now() - start_time).total_seconds() > YT_START_TIMEOUT_SEC:
                logger.warning(f"Task {task_id} timed out waiting for browser cookies/response")
                kill_process_tree(proc.pid)
                download_tasks[task_id] = {
                    "status": "error",
                    "error": (
                        f"Время ожидания ответа истекло ({YT_START_TIMEOUT_SEC} сек). "
                        "Если выбран Chrome, браузер заблокировал чтение cookies. "
                        "Пожалуйста, загрузите файл cookies.txt во вкладке 'Настройки Cookies' "
                        "(экспортируется за 1 минуту через расширение 'Get cookies.txt LOCALLY')."
                    )
                }
                break

        current_status = download_tasks.get(task_id, {}).get("status")
        if (
            not download_tasks.get(task_id, {}).get("cancelled")
            and current_status in ("starting", "downloading", "converting")
        ):
            download_tasks[task_id] = {
                "status": "error",
                "error": "Процесс загрузки завершился без результата. Проверьте журнал backend-а."
            }

        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            logger.warning(f"Worker PID {proc.pid} did not exit, killing it")
            kill_process_tree(proc.pid)
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                pass
    except Exception as e:
        logger.error(f"Exception during worker monitoring: {e}")
        kill_process_tree(proc.pid)
        download_tasks[task_id] = {
            "status": "error",
            "error": f"Ошибка мониторинга загрузки: {e}"
        }
    finally:
        active_download_processes.pop(task_id, None)
        status = download_tasks.get(task_id, {}).get("status")
        if status in ("cancelled", "error"):
            if status == "cancelled":
                download_tasks[task_id] = {
                    "status": "cancelled",
                    "percent": 0,
                    "error": "Скачивание отменено пользователем"
                }
            # Clean up partial files for failed/cancelled downloads.
            for p in LIBRARY_DIR.glob(f"{file_id}.*"):
                try:
                    p.unlink(missing_ok=True)
                except Exception:
                    pass

@app.post("/api/youtube/download")
async def start_youtube_download(req: YoutubeDownloadRequest, background_tasks: BackgroundTasks):
    url = validate_video_url(req.url)
    task_id = str(uuid.uuid4())
    download_tasks[task_id] = {
        "status": "starting",
        "percent": 0,
        "url": url,
        "cancelled": False
    }
    download_task_timestamps[task_id] = time.time()
    background_tasks.add_task(
        run_yt_download,
        task_id=task_id,
        url=url,
        custom_title=req.title,
        category=req.category,
        tags=req.tags,
        browser=req.browser_cookies
    )
    return {"task_id": task_id, "status": "started"}

@app.post("/api/youtube/cancel/{task_id}")
def cancel_youtube_download(task_id: str):
    logger.info(f"Cancellation requested for task {task_id}")
    download_task_timestamps[task_id] = time.time()
    if task_id in download_tasks:
        download_tasks[task_id]["cancelled"] = True
        download_tasks[task_id]["status"] = "cancelled"
        download_tasks[task_id]["error"] = "Скачивание отменено пользователем"
    
    if task_id in active_download_processes:
        proc = active_download_processes.pop(task_id)
        logger.info(f"Immediately killing worker process PID {proc.pid}")
        kill_process_tree(proc.pid)

    return {"status": "cancelled", "task_id": task_id}

@app.get("/api/youtube/status/{task_id}")
def check_download_status(task_id: str):
    cleanup_stale_download_tasks()
    if task_id not in download_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    download_task_timestamps[task_id] = time.time()
    return download_tasks[task_id]

# --- Presets API ---

@app.get("/api/presets")
def get_presets():
    return load_json(PRESETS_FILE, [])

@app.post("/api/presets")
def save_preset(preset: PresetModel):
    with _DATA_LOCK:
        presets = load_json(PRESETS_FILE, [])
        new_preset = preset.model_dump()
        if not new_preset.get("id"):
            new_preset["id"] = f"preset-{uuid.uuid4().hex[:8]}"
            presets.append(new_preset)
        else:
            updated = False
            for idx, p in enumerate(presets):
                if p["id"] == new_preset["id"]:
                    presets[idx] = new_preset
                    updated = True
                    break
            if not updated:
                presets.append(new_preset)

        save_json(PRESETS_FILE, presets)
        return new_preset

@app.delete("/api/presets/{preset_id}")
def delete_preset(preset_id: str):
    with _DATA_LOCK:
        presets = load_json(PRESETS_FILE, [])
        new_presets = [p for p in presets if p["id"] != preset_id]
        save_json(PRESETS_FILE, new_presets)
        return {"status": "deleted"}

def _is_local_websocket(websocket: WebSocket) -> bool:
    client = websocket.client
    if client is None:
        return False
    return (client.host or "") in ("127.0.0.1", "::1", "localhost")

@app.websocket("/ws")
async def playback_websocket(websocket: WebSocket):
    token = (
        websocket.query_params.get("token")
        or websocket.cookies.get(API_TOKEN_COOKIE)
        or websocket.headers.get("x-rpg-token")
        or ""
    ).strip()
    if not _is_token_valid(token):
        await websocket.close(code=4401)
        return

    role = (websocket.query_params.get("role") or "remote").strip().lower()
    if role not in ("host", "remote"):
        await websocket.close(code=4404)
        return
    if role == "host" and not _is_local_websocket(websocket):
        # Only the desktop player may be authoritative. Remotes cannot
        # hijack playback state even if they know the API token.
        await websocket.close(code=4403)
        return

    await websocket.accept()

    if role == "host":
        await playback_hub.set_host(websocket)
        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    message = json.loads(raw)
                except Exception:
                    continue
                if message.get("type") == "state" and isinstance(message.get("state"), dict):
                    await playback_hub.publish_state(message["state"])
        except WebSocketDisconnect:
            pass
        finally:
            await playback_hub.remove_host(websocket)
    else:
        await playback_hub.add_remote(websocket)
        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    message = json.loads(raw)
                except Exception:
                    continue
                if message.get("type") == "command" and isinstance(message.get("command"), dict):
                    await playback_hub.forward_command(websocket, message["command"])
                elif message.get("type") == "request_state" and playback_hub.last_state is not None:
                    await websocket.send_text(
                        json.dumps(
                            {"type": "state", "state": playback_hub.last_state},
                            ensure_ascii=False,
                        )
                    )
        except WebSocketDisconnect:
            pass
        finally:
            await playback_hub.remove_remote(websocket)

# Serve frontend build if exists
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    local_ip = get_local_ip()
    print("=" * 60)
    print(" RPG Music & Ambience Studio")
    token_q = quote(API_TOKEN, safe='')
    print(f" Local Web:   http://localhost:{port}/?token={token_q}")
    print(f" Android/LAN: http://{local_ip}:{port}/?token={token_q}")
    print(f" Data dir:    {STORAGE_ROOT}")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=port)
