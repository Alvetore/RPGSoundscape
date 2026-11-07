import sys
import os
import json
import argparse
import logging
from pathlib import Path

# Unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

import yt_dlp

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

    def progress_hook(d):
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 1
            downloaded = d.get("downloaded_bytes", 0)
            percent = round((downloaded / total) * 100, 1)
            msg = {
                "status": "downloading",
                "percent": percent,
                "speed": d.get("speed", 0),
                "eta": d.get("eta", 0)
            }
            print(f"PROGRESS:{json.dumps(msg)}", flush=True)
        elif d.get("status") == "finished":
            msg = {"status": "converting", "percent": 100}
            print(f"PROGRESS:{json.dumps(msg)}", flush=True)

    opts = {
        'quiet': True,
        'no_warnings': True,
        'socket_timeout': 15,
        'outtmpl': output_template,
        'format': 'ba/ba*/b/b*/best/worst',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'progress_hooks': [progress_hook],
    }

    # Cookie configuration
    if args.cookies_file and os.path.exists(args.cookies_file) and os.path.getsize(args.cookies_file) > 10:
        opts['cookiefile'] = args.cookies_file
    elif args.browser in ("chrome", "firefox", "edge", "opera", "brave", "vivaldi"):
        opts['cookiesfrombrowser'] = (args.browser,)

    print("PROGRESS:{\"status\":\"starting\",\"percent\":0}", flush=True)

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(args.url, download=True)

        final_filename = f"{args.file_id}.mp3"
        final_path = library_dir / final_filename

        if not final_path.exists():
            candidates = list(library_dir.glob(f"{args.file_id}.*"))
            if candidates:
                final_path = candidates[0]
                final_filename = final_path.name
            else:
                raise Exception("Файл аудио не найден на диске после конвертации.")

        title = args.title.strip() if args.title.strip() else info.get("title", "YouTube Audio")
        duration = info.get("duration", 0)
        filesize = final_path.stat().st_size if final_path.exists() else 0

        tag_list = [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else ["youtube"]

        result = {
            "id": args.file_id,
            "title": title,
            "filename": final_filename,
            "duration": duration,
            "category": args.category or "YouTube",
            "tags": tag_list,
            "source": "youtube",
            "source_url": args.url,
            "filesize": filesize
        }

        print(f"SUCCESS:{json.dumps(result)}", flush=True)
    except Exception as e:
        err_msg = str(e)
        print(f"ERROR:{err_msg}", flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
