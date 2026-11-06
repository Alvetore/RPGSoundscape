import os
import sys
import json
import uuid
import socket
import asyncio
import logging
from typing import List, Optional, Dict, Any
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import yt_dlp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rpg_music")

# Base paths
BASE_DIR = Path(__file__).resolve().parent
LIBRARY_DIR = BASE_DIR / "audio_library"
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = BASE_DIR.parent / "frontend" / "dist"

LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

METADATA_FILE = DATA_DIR / "library.json"
PRESETS_FILE = DATA_DIR / "presets.json"
SETTINGS_FILE = DATA_DIR / "settings.json"
COOKIES_FILE = DATA_DIR / "cookies.txt"

app = FastAPI(title="RPG Music & Ambience Studio", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active download tasks dictionary: task_id -> status dict
download_tasks: Dict[str, Dict[str, Any]] = {}

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

def save_json(file_path: Path, data: Any):
    temp_file = file_path.with_suffix(".tmp")
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(temp_file, file_path)

def get_settings() -> Dict[str, Any]:
    return load_json(SETTINGS_FILE, {"cookie_source": "auto"})

def save_settings(settings: Dict[str, Any]):
    save_json(SETTINGS_FILE, settings)

def sync_library_with_disk():
    """Ensure all audio files in LIBRARY_DIR are registered in library.json."""
    data = load_json(METADATA_FILE, {"tracks": []})
    existing_files = {t["filename"] for t in data["tracks"]}
    
    valid_extensions = {".mp3", ".wav", ".ogg", ".flac", ".m4a", ".webm", ".aac", ".opus"}
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
    settings = get_settings()
    cookie_source = custom_browser or settings.get("cookie_source", "auto")

    opts: Dict[str, Any] = {
        'quiet': True,
        'no_warnings': True,
    }

    # 1. Cookie file check (cookies.txt)
    if (cookie_source in ("auto", "file")) and COOKIES_FILE.exists() and COOKIES_FILE.stat().st_size > 10:
        opts['cookiefile'] = str(COOKIES_FILE)
    elif cookie_source in ("chrome", "firefox", "edge", "opera", "brave", "vivaldi"):
        try:
            opts['cookiesfrombrowser'] = (cookie_source,)
        except Exception as e:
            logger.warning(f"Could not configure cookiesfrombrowser for {cookie_source}: {e}")

    if not for_download:
        opts['skip_download'] = True
    else:
        opts['format'] = 'bestaudio/best'

    return opts

def translate_yt_error(err_str: str) -> str:
    """Translates technical yt-dlp / YouTube errors into clear, actionable advice."""
    lower = err_str.lower()
    if "sign in to confirm you’re not a bot" in lower or "sign in to confirm" in lower:
        return (
            "YouTube заблокировал анонимный запрос проверкой 'Подтвердите, что вы не бот'. "
            "Чтобы скачивать без ограничений, загрузите файл cookies.txt во вкладке 'Настройки Cookies' "
            "(экспортируется за 1 минуту через расширение 'Get cookies.txt LOCALLY' в браузере) "
            "или выберите ваш установленный браузер."
        )
    elif "the page needs to be reloaded" in lower:
        return (
            "Сессия YouTube в браузере устарела или страница требует перезагрузки. "
            "Рекомендуется экспортировать свежий файл cookies.txt или перезапустить браузер."
        )
    elif "video unavailable" in lower:
        return "Данное видео недоступно на YouTube (удалено, заблокировано в регионе или является приватным)."
    elif "failed to decrypt with dpapi" in lower:
        return (
            "Браузер защитил cookies системным шифрованием Windows DPAPI. "
            "Пожалуйста, загрузите файл cookies.txt вручную во вкладке 'Настройки Cookies'."
        )
    return err_str

# --- Models ---
class TrackUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None

class PresetSlotModel(BaseModel):
    slotIndex: int
    trackId: Optional[str] = None
    title: Optional[str] = None
    volume: float = 0.7
    loop: bool = True
    active: bool = False
    pan: float = 0.0
    playbackRate: float = 1.0

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
def get_info():
    ip = get_local_ip()
    return {
        "status": "online",
        "app": "RPG Music & Ambience Studio",
        "version": "1.0.0",
        "lan_ip": ip,
        "access_url": f"http://{ip}:8000"
    }

@app.get("/api/library")
def get_library():
    data = sync_library_with_disk()
    return data["tracks"]

@app.get("/api/library/{track_id}")
def get_track_info(track_id: str):
    data = sync_library_with_disk()
    for t in data["tracks"]:
        if t["id"] == track_id:
            return t
    raise HTTPException(status_code=404, detail="Track not found")

@app.put("/api/library/{track_id}")
def update_track(track_id: str, payload: TrackUpdate):
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
    data = load_json(METADATA_FILE, {"tracks": []})
    target_filename = None
    new_tracks = []
    for t in data["tracks"]:
        if t["id"] == track_id:
            target_filename = t["filename"]
        else:
            new_tracks.append(t)
    
    if target_filename:
        file_path = LIBRARY_DIR / target_filename
        if file_path.exists():
            try:
                os.remove(file_path)
            except Exception as e:
                logger.error(f"Failed to delete file {file_path}: {e}")
        data["tracks"] = new_tracks
        save_json(METADATA_FILE, data)
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Track not found")

@app.get("/api/audio/{filename}")
async def stream_audio(filename: str):
    """Serve offline audio file with full streaming range support."""
    file_path = LIBRARY_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    media_type = "audio/mpeg"
    suffix = file_path.suffix.lower()
    if suffix == ".ogg":
        media_type = "audio/ogg"
    elif suffix == ".wav":
        media_type = "audio/wav"
    elif suffix in (".m4a", ".aac"):
        media_type = "audio/mp4"
    elif suffix == ".webm":
        media_type = "audio/webm"
    elif suffix == ".flac":
        media_type = "audio/flac"
        
    return FileResponse(path=file_path, media_type=media_type, filename=filename)

@app.post("/api/upload")
async def upload_audio(file: UploadFile = File(...), category: str = Form("Local"), tags: str = Form("")):
    """Allow user to drag & drop or upload local audio files."""
    file_id = str(uuid.uuid4())
    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".mp3", ".wav", ".ogg", ".flac", ".m4a", ".webm", ".aac", ".opus"}:
        raise HTTPException(status_code=400, detail="Unsupported audio format")
    
    safe_filename = f"{file_id}{suffix}"
    destination = LIBRARY_DIR / safe_filename
    
    content = await file.read()
    with open(destination, "wb") as f:
        f.write(content)
        
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
        "filesize": len(content),
        "date_added": datetime.now().isoformat()
    }
    
    data = load_json(METADATA_FILE, {"tracks": []})
    data["tracks"].append(track_item)
    save_json(METADATA_FILE, data)
    
    return track_item

# --- Cookie Management Endpoints ---

@app.get("/api/youtube/cookies")
def get_cookie_status():
    settings = get_settings()
    has_file = COOKIES_FILE.exists() and COOKIES_FILE.stat().st_size > 10
    file_size = COOKIES_FILE.stat().st_size if COOKIES_FILE.exists() else 0
    return {
        "has_cookies_file": has_file,
        "file_size": file_size,
        "cookie_source": settings.get("cookie_source", "auto"),
        "available_browsers": ["auto", "file", "chrome", "firefox", "edge", "opera", "brave", "none"]
    }

@app.post("/api/youtube/cookies")
async def upload_cookies_file(file: UploadFile = File(...)):
    """Upload Netscape-format cookies.txt to authenticate yt-dlp against YouTube bot-checks."""
    content = await file.read()
    if len(content) < 10:
        raise HTTPException(status_code=400, detail="Файл cookies пустой")
    with open(COOKIES_FILE, "wb") as f:
        f.write(content)
    settings = get_settings()
    settings["cookie_source"] = "auto"
    save_settings(settings)
    return {"status": "saved", "size": len(content)}

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
    url = payload.get("url")
    browser = payload.get("browser")
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    def extract():
        opts = build_ydl_opts(for_download=False, custom_browser=browser)
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=False)
            
    try:
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

def run_yt_download(task_id: str, url: str, custom_title: Optional[str], category: str, tags: List[str], browser: Optional[str] = None):
    """Background worker for yt-dlp download & conversion to mp3."""
    file_id = str(uuid.uuid4())
    output_template = str(LIBRARY_DIR / f"{file_id}.%(ext)s")
    
    def progress_hook(d):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 1
            downloaded = d.get('downloaded_bytes', 0)
            percent = round((downloaded / total) * 100, 1)
            download_tasks[task_id].update({
                "status": "downloading",
                "percent": percent,
                "speed": d.get('speed', 0),
                "eta": d.get('eta', 0)
            })
        elif d['status'] == 'finished':
            download_tasks[task_id].update({
                "status": "converting",
                "percent": 100
            })

    ydl_opts = build_ydl_opts(for_download=True, custom_browser=browser)
    ydl_opts.update({
        'outtmpl': output_template,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'progress_hooks': [progress_hook],
    })

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            
        final_filename = f"{file_id}.mp3"
        final_path = LIBRARY_DIR / final_filename
        
        # Verify file exists
        if not final_path.exists():
            candidates = list(LIBRARY_DIR.glob(f"{file_id}.*"))
            if candidates:
                final_path = candidates[0]
                final_filename = final_path.name
            else:
                raise Exception("Файл не найден после конвертации.")
                
        title = custom_title if custom_title else info.get("title", "YouTube Audio")
        duration = info.get("duration", 0)
        filesize = final_path.stat().st_size if final_path.exists() else 0
        
        new_track = {
            "id": file_id,
            "title": title,
            "filename": final_filename,
            "duration": duration,
            "category": category or "YouTube",
            "tags": tags or ["youtube"],
            "source": "youtube",
            "source_url": url,
            "filesize": filesize,
            "date_added": datetime.now().isoformat()
        }
        
        data = load_json(METADATA_FILE, {"tracks": []})
        data["tracks"].append(new_track)
        save_json(METADATA_FILE, data)
        
        download_tasks[task_id] = {
            "status": "completed",
            "percent": 100,
            "track": new_track
        }
    except Exception as e:
        err_msg = str(e)
        logger.error(f"Download failed: {err_msg}")
        download_tasks[task_id] = {
            "status": "error",
            "error": translate_yt_error(err_msg)
        }

@app.post("/api/youtube/download")
async def start_youtube_download(req: YoutubeDownloadRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    download_tasks[task_id] = {
        "status": "starting",
        "percent": 0,
        "url": req.url
    }
    background_tasks.add_task(
        run_yt_download,
        task_id=task_id,
        url=req.url,
        custom_title=req.title,
        category=req.category,
        tags=req.tags,
        browser=req.browser_cookies
    )
    return {"task_id": task_id, "status": "started"}

@app.get("/api/youtube/status/{task_id}")
def check_download_status(task_id: str):
    if task_id not in download_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return download_tasks[task_id]

# --- Presets API ---

@app.get("/api/presets")
def get_presets():
    return load_json(PRESETS_FILE, [])

@app.post("/api/presets")
def save_preset(preset: PresetModel):
    presets = load_json(PRESETS_FILE, [])
    new_preset = preset.dict()
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
    presets = load_json(PRESETS_FILE, [])
    new_presets = [p for p in presets if p["id"] != preset_id]
    save_json(PRESETS_FILE, new_presets)
    return {"status": "deleted"}

# Serve frontend build if exists
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    local_ip = get_local_ip()
    print("=" * 60)
    print(" RPG Music & Ambience Studio")
    print(f" Local Web:   http://localhost:{port}")
    print(f" Android/LAN: http://{local_ip}:{port}")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=port)
