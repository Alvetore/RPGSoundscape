@echo off
cd /d "%~dp0"
if exist "RPGSoundscape.exe" (
    start "" "%~dp0RPGSoundscape.exe"
    exit /b 0
)
if exist "release\win-unpacked\RPGSoundscape.exe" (
    start "" "%~dp0release\win-unpacked\RPGSoundscape.exe"
    exit /b 0
)
py -3.14 --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    py -3.14 run.py
) else (
    python run.py
)
