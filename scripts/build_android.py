"""Build the Android APK and copy it into release/."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANDROID = ROOT / "android"
FRONTEND = ROOT / "frontend"
ASSETS_WWW = ANDROID / "app" / "src" / "main" / "assets" / "www"
RELEASE = ROOT / "release"


def run(command: list[str], cwd: Path, env: dict[str, str] | None = None) -> None:
    printable = " ".join(str(part) for part in command)
    print(f"> {printable}")
    result = subprocess.run(command, cwd=cwd, env=env)
    if result.returncode != 0:
        raise SystemExit(f"Command failed with exit code {result.returncode}: {printable}")


def find_java_home() -> Path:
    candidates = [
        os.environ.get("JAVA_HOME"),
        r"C:\Program Files\Android\Android Studio\jbr",
        r"C:\Program Files\Android\Android Studio\jre",
    ]
    for candidate in candidates:
        if candidate and (Path(candidate) / "bin" / "java.exe").exists():
            return Path(candidate)
    raise SystemExit("Java 17+ was not found. Install Android Studio or set JAVA_HOME.")


def find_android_sdk() -> Path:
    candidates = [
        os.environ.get("ANDROID_HOME"),
        os.environ.get("ANDROID_SDK_ROOT"),
        os.environ.get("LOCALAPPDATA", "") + r"\Android\Sdk",
        r"C:\Android\Sdk",
    ]
    for candidate in candidates:
        if candidate and (Path(candidate) / "platforms" / "android-35" / "android.jar").exists():
            return Path(candidate)
    raise SystemExit(
        "Android SDK 35 was not found. Install it with sdkmanager "
        "or set ANDROID_HOME."
    )


def write_local_properties(sdk: Path) -> None:
    escaped = str(sdk).replace("\\", "\\\\")
    (ANDROID / "local.properties").write_text(f"sdk.dir={escaped}\n", encoding="ascii")
    print(f"Android SDK: {sdk}")


def build_frontend() -> None:
    npm = "npm.cmd" if os.name == "nt" else "npm"
    run([npm, "run", "build"], cwd=FRONTEND)
    if ASSETS_WWW.exists():
        shutil.rmtree(ASSETS_WWW)
    shutil.copytree(FRONTEND / "dist", ASSETS_WWW)
    print(f"Bundled frontend: {ASSETS_WWW}")


def build_apk(java_home: Path, debug: bool) -> Path:
    gradlew = ANDROID / ("gradlew.bat" if os.name == "nt" else "gradlew")
    if not gradlew.exists():
        raise SystemExit(f"Gradle wrapper not found: {gradlew}")
    task = ":app:assembleDebug" if debug else ":app:assembleRelease"
    env = os.environ.copy()
    env["JAVA_HOME"] = str(java_home)
    run([str(gradlew), task, "--no-daemon"], cwd=ANDROID, env=env)
    variant = "debug" if debug else "release"
    apk = ANDROID / "app" / "build" / "outputs" / "apk" / variant / f"app-{variant}.apk"
    if not apk.exists():
        raise SystemExit(f"APK was not created: {apk}")
    return apk


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-frontend", action="store_true")
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    if not (ANDROID / "app" / "build.gradle").exists():
        print("Android project was not found.")
        return 1

    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8-sig"))
    version = package.get("version", "1.1.0")

    java_home = find_java_home()
    sdk = find_android_sdk()
    write_local_properties(sdk)

    if not (ANDROID / "keystore.properties").exists():
        print("WARNING: android/keystore.properties is missing; the APK will be debug-signed.")

    if not args.skip_frontend:
        build_frontend()
    elif not (ASSETS_WWW / "index.html").exists():
        raise SystemExit("Bundled frontend is missing. Run without --skip-frontend.")

    apk = build_apk(java_home, args.debug)

    RELEASE.mkdir(parents=True, exist_ok=True)
    target = RELEASE / f"RPGSoundscape-Android-{version}.apk"
    shutil.copy2(apk, target)
    digest = hashlib.sha256(target.read_bytes()).hexdigest().upper()
    print(f"APK: {target} ({target.stat().st_size:,} bytes)")
    print(f"SHA-256: {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
