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
python run.py
