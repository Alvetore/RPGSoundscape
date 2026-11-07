"""Prepare portable runtime binaries (Node.js + ffmpeg) for packaging."""

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BIN_DIR = ROOT / "backend" / "bin"


def main() -> int:
    if sys.version_info < (3, 11):
        print("Python 3.11+ is required.")
        return 1

    BIN_DIR.mkdir(parents=True, exist_ok=True)

    try:
        import imageio_ffmpeg
    except ImportError:
        print("imageio-ffmpeg is not installed. Run: py -3.14 -m pip install -r backend/requirements-build.txt")
        return 1

    ffmpeg_source = Path(imageio_ffmpeg.get_ffmpeg_exe())
    ffmpeg_target = BIN_DIR / "ffmpeg.exe"
    shutil.copy2(ffmpeg_source, ffmpeg_target)
    print(f"ffmpeg: {ffmpeg_target} ({ffmpeg_target.stat().st_size:,} bytes)")

    node_source = shutil.which("node")
    if not node_source:
        print("Node.js was not found in PATH. Install Node.js 22+ or put node.exe into backend/bin.")
        return 1
    node_target = BIN_DIR / "node.exe"
    shutil.copy2(node_source, node_target)
    print(f"node:   {node_target} ({node_target.stat().st_size:,} bytes)")

    notices = ROOT / "THIRD_PARTY_NOTICES.txt"
    if notices.exists():
        shutil.copy2(notices, BIN_DIR / "THIRD_PARTY_NOTICES.txt")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
