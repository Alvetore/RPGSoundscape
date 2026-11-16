"""Compile the WinForms launcher (RPGSoundscape.exe) from Launcher.cs."""

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def find_csc() -> Path:
    windir = os.environ.get("WINDIR")
    candidates = [
        os.environ.get("CSC"),
        Path(windir) / "Microsoft.NET" / "Framework64" / "v4.0.30319" / "csc.exe" if windir else None,
        Path(windir) / "Microsoft.NET" / "Framework" / "v4.0.30319" / "csc.exe" if windir else None,
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    raise SystemExit(
        "csc.exe (.NET Framework 4 compiler) was not found. "
        "Install the .NET Framework 4.8 Developer Pack or point CSC at csc.exe."
    )


def main() -> int:
    if sys.version_info < (3, 11):
        print("Python 3.11+ is required.")
        return 1

    source = ROOT / "Launcher.cs"
    icon = ROOT / "icon.ico"
    output = ROOT / "RPGSoundscape.exe"
    if not source.is_file():
        raise SystemExit(f"Launcher source not found: {source}")

    cmd = [
        str(find_csc()),
        "/nologo",
        "/target:winexe",
        "/r:System.dll",
        "/r:System.Windows.Forms.dll",
        "/r:System.Drawing.dll",
        f"/out:{output}",
    ]
    if icon.is_file():
        cmd.append(f"/win32icon:{icon}")
    cmd.append(str(source))

    print(" ".join(cmd))
    result = subprocess.run(cmd, cwd=ROOT)
    if result.returncode != 0:
        raise SystemExit(f"Launcher build failed with exit code {result.returncode}")
    if not output.is_file():
        raise SystemExit(f"{output} was not created")

    print(f"Launcher: {output} ({output.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
