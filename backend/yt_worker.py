import sys
import os
import json
import argparse
import logging
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

# Unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

import yt_dlp

DEFAULT_COBALT_APIS = ("https://rue-cobalt.xenon.zone",)
MAX_DOWNLOAD_BYTES = int(os.environ.get("RPG_MAX_DOWNLOAD_MB", "500")) * 1024 * 1024
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
)


def emit(**payload):
    # Unique protocol prefix: yt-dlp itself prints lines starting with
    # "ERROR:" to stderr, which must not be mistaken for our final result.
    print(f"RPGPROGRESS:{json.dumps(payload)}", flush=True)


def get_cobalt_apis():
    """External fallback downloader endpoints, overridable via env."""
    raw = os.environ.get("RPG_COBALT_APIS", "").strip()
    if raw.lower() in ("0", "off", "none", "false"):
        return []
    if raw:
        return [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]
    return [item.rstrip("/") for item in DEFAULT_COBALT_APIS]


def is_youtube_url(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host in ("youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be")


def is_safe_media_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.hostname or "").lower()
    if not host or host in ("localhost", "127.0.0.1", "::1"):
        return False
    return True


def request_cobalt(api: str, video_url: str) -> dict:
    payload = json.dumps(
        {
            "url": video_url,
            "downloadMode": "audio",
            "audioFormat": "mp3",
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{api}/",
        data=payload,
        method="POST",
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read()
    return json.loads(body.decode("utf-8", errors="replace"))


def extract_cobalt_media_url(payload: dict) -> str:
    status = payload.get("status")
    if status in ("tunnel", "redirect"):
        return payload.get("url") or ""

    # Some instances return a picker for videos with multiple variants.
    picker = payload.get("picker")
    if isinstance(picker, list):
        for item in picker:
            if isinstance(item, dict) and item.get("url"):
                return item["url"]

    error = payload.get("error")
    if isinstance(error, dict):
        raise RuntimeError(error.get("code") or error.get("message") or "cobalt error")
    raise RuntimeError(f"unexpected cobalt status: {status}")


def download_via_cobalt(
    video_url: str,
    file_id: str,
    library_dir: Path,
    custom_title: str,
    category: str,
    tags: list,
) -> dict:
    """Download MP3 from a Cobalt-compatible public instance.

    This is a fallback for networks where YouTube blocks the local yt-dlp
    media stream (403/empty fragment). Only the public video URL is sent to
    the fallback service; YouTube cookies are never forwarded.
    """
    errors = []
    for api in get_cobalt_apis():
        try:
            payload = request_cobalt(api, video_url)
            media_url = extract_cobalt_media_url(payload)
            if not media_url or not is_safe_media_url(media_url):
                raise RuntimeError("cobalt returned an unsafe media URL")

            temp_path = library_dir / f"{file_id}.cobalt.part"
            final_path = library_dir / f"{file_id}.mp3"
            total_size = 0
            content_length = 0

            emit(status="downloading", percent=0, fallback="cobalt")
            request = urllib.request.Request(
                media_url,
                headers={"User-Agent": USER_AGENT},
            )
            try:
                with urllib.request.urlopen(request, timeout=90) as response, open(
                    temp_path, "wb"
                ) as output:
                    content_length = int(response.headers.get("Content-Length") or 0)
                    while True:
                        chunk = response.read(64 * 1024)
                        if not chunk:
                            break
                        total_size += len(chunk)
                        if total_size > MAX_DOWNLOAD_BYTES:
                            raise RuntimeError("cobalt download exceeded size limit")
                        output.write(chunk)
                        if content_length:
                            percent = round(min(99.0, total_size / content_length * 100), 1)
                            emit(status="downloading", percent=percent, fallback="cobalt")
            except Exception:
                temp_path.unlink(missing_ok=True)
                raise

            if total_size <= 0:
                temp_path.unlink(missing_ok=True)
                raise RuntimeError("cobalt returned an empty file")

            os.replace(temp_path, final_path)
            fallback_name = str(payload.get("filename") or "").strip()
            fallback_title = Path(fallback_name).stem if fallback_name else "YouTube Audio"
            title = custom_title.strip() or fallback_title
            return {
                "id": file_id,
                "title": title,
                "filename": final_path.name,
                "duration": 0,
                "category": category or "YouTube",
                "tags": tags or ["youtube"],
                "source": "youtube",
                "source_url": video_url,
                "filesize": final_path.stat().st_size,
                "downloader": "cobalt",
            }
        except Exception as exc:
            errors.append(f"{api}: {exc}")

    raise RuntimeError("; ".join(errors) if errors else "cobalt fallback disabled")


def build_result(file_id: str, final_path: Path, title: str, duration, category: str, tags: list):
    return {
        "id": file_id,
        "title": title,
        "filename": final_path.name,
        "duration": duration,
        "category": category or "YouTube",
        "tags": tags or ["youtube"],
        "source": "youtube",
        "source_url": None,
        "filesize": final_path.stat().st_size if final_path.exists() else 0,
    }


def main():
    parser = argparse.ArgumentParser(description="Standalone YouTube Audio Worker")
    parser.add_argument("--url", required=True, help="YouTube video URL")
    parser.add_argument("--file-id", required=True, help="Unique track ID")
    parser.add_argument("--library-dir", required=True, help="Directory to save downloaded audio")
    parser.add_argument("--title", default="", help="Custom track title")
    parser.add_argument("--category", default="YouTube", help="Track category")
    parser.add_argument("--tags", default="", help="Comma-separated tags")
    parser.add_argument("--cookies-file", default="", help="Path to cookies.txt")
    parser.add_argument("--browser", default="", help="Browser to extract cookies from")
    args = parser.parse_args()

    library_dir = Path(args.library_dir)
    library_dir.mkdir(parents=True, exist_ok=True)
    output_template = str(library_dir / f"{args.file_id}.%(ext)s")
    tag_list = [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else ["youtube"]

    def progress_hook(d):
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 1
            downloaded = d.get("downloaded_bytes", 0)
            percent = round((downloaded / total) * 100, 1)
            emit(
                status="downloading",
                percent=percent,
                speed=d.get("speed", 0),
                eta=d.get("eta", 0),
            )
        elif d.get("status") == "finished":
            emit(status="converting", percent=100)

    opts = {
        'quiet': True,
        'no_warnings': True,
        'socket_timeout': 15,
        'outtmpl': output_template,
        'format': 'ba/ba*/b/b*/best/worst',
        'http_headers': {
            'User-Agent': USER_AGENT,
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'progress_hooks': [progress_hook],
    }

    # Cookie configuration with isolated copy
    temp_cookie_copy = None
    if args.cookies_file and os.path.exists(args.cookies_file) and os.path.getsize(args.cookies_file) > 10:
        import shutil
        temp_cookie_copy = library_dir.parent / "data" / f"worker_cookie_{args.file_id}.txt"
        try:
            shutil.copyfile(args.cookies_file, temp_cookie_copy)
            opts['cookiefile'] = str(temp_cookie_copy)
        except Exception:
            opts['cookiefile'] = args.cookies_file
    elif args.browser in ("chrome", "firefox", "edge", "opera", "brave", "vivaldi"):
        opts['cookiesfrombrowser'] = (args.browser,)

    emit(status="starting", percent=0)

    ytdlp_error = None
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(args.url, download=True)

        final_filename = f"{args.file_id}.mp3"
        final_path = library_dir / final_filename

        if not final_path.exists():
            candidates = list(library_dir.glob(f"{args.file_id}.*"))
            if candidates:
                final_path = candidates[0]
            else:
                raise Exception("Файл аудио не найден на диске после конвертации.")

        title = args.title.strip() if args.title.strip() else info.get("title", "YouTube Audio")
        result = build_result(
            args.file_id,
            final_path,
            title,
            info.get("duration", 0),
            args.category,
            tag_list,
        )
        result["source_url"] = args.url
        print(f"RPGSUCCESS:{json.dumps(result)}", flush=True)
        return
    except Exception as exc:
        ytdlp_error = exc
        # Do not leave a partially downloaded/converted file that the
        # library scanner would later expose as a broken track.
        for partial in library_dir.glob(f"{args.file_id}.*"):
            try:
                partial.unlink(missing_ok=True)
            except Exception:
                pass

    # YouTube media streams are often blocked locally (403 / empty fragment)
    # while a remote Cobalt instance can still fetch them. Only the public
    # video URL is sent; cookies stay on this machine.
    if is_youtube_url(args.url) and get_cobalt_apis():
        emit(status="downloading", percent=0, fallback="cobalt")
        try:
            result = download_via_cobalt(
                args.url,
                args.file_id,
                library_dir,
                args.title,
                args.category,
                tag_list,
            )
            print(f"RPGSUCCESS:{json.dumps(result)}", flush=True)
            return
        except Exception as fallback_error:
            ytdlp_error = Exception(f"{ytdlp_error}; Cobalt fallback: {fallback_error}")

    print(f"RPGERROR:{ytdlp_error}", flush=True)
    for partial in library_dir.glob(f"{args.file_id}.*"):
        try:
            partial.unlink(missing_ok=True)
        except Exception:
            pass
    sys.exit(1)


if __name__ == "__main__":
    main()
