"""Build self-contained FastAPI backend and yt-dlp worker executables."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "backend-dist"
SPEC = ROOT / "build" / "spec"

COMMON = [
    "--noconfirm",
    "--clean",
    "--onefile",
    "--log-level",
    "WARN",
    "--distpath",
    str(DIST),
    "--specpath",
    str(SPEC),
    "--icon",
    str(ROOT / "icon.ico"),
]

YT_COLLECT = [
    "--collect-all", "yt_dlp",
    "--collect-all", "yt_dlp_ejs",
    "--collect-all", "certifi",
    "--collect-all", "requests",
    "--collect-all", "urllib3",
    "--collect-all", "brotli",
    "--collect-all", "mutagen",
    "--collect-all", "Cryptodome",
    "--collect-all", "websockets",
]

BACKEND_COLLECT = YT_COLLECT + [
    "--collect-all", "fastapi",
    "--collect-all", "starlette",
    "--collect-all", "pydantic",
    "--collect-all", "multipart",
    "--collect-all", "anyio",
    "--collect-all", "uvicorn",
    "--hidden-import", "uvicorn.logging",
    "--hidden-import", "uvicorn.loops.auto",
    "--hidden-import", "uvicorn.protocols.http.auto",
    "--hidden-import", "uvicorn.protocols.websockets.auto",
    "--hidden-import", "uvicorn.lifespan.on",
]


def run_build(name: str, entry: Path, work: Path, extra: list) -> None:
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        *COMMON,
        "--name",
        name,
        "--workpath",
        str(work),
        *extra,
        str(entry),
    ]
    print(f"\n=== Building {name} ===", flush=True)
    result = subprocess.run(cmd, cwd=ROOT)
    if result.returncode != 0:
        raise SystemExit(f"{name} build failed with exit code {result.returncode}")


def main() -> int:
    if sys.version_info < (3, 11):
        print("Python 3.11+ is required.")
        return 1

    DIST.mkdir(parents=True, exist_ok=True)
    SPEC.mkdir(parents=True, exist_ok=True)

    run_build(
        "rpg_backend",
        ROOT / "backend" / "app.py",
        ROOT / "build" / "pyinstaller-backend",
        BACKEND_COLLECT,
    )
    run_build(
        "rpg_yt_worker",
        ROOT / "backend" / "yt_worker.py",
        ROOT / "build" / "pyinstaller-worker",
        YT_COLLECT,
    )

    for name in ("rpg_backend.exe", "rpg_yt_worker.exe"):
        path = DIST / name
        if not path.exists():
            print(f"ERROR: {path} was not created")
            return 1
        print(f"{name}: {path.stat().st_size:,} bytes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
