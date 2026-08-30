@echo off
rem Remainder launcher: start backend server (if not running) + desktop app (if not running)
cd /d C:\projects\remainder

curl -s -o nul -w "%%{http_code}" http://127.0.0.1:3210/api/health | findstr "200" >nul
if errorlevel 1 (
    echo Starting Remainder server...
    start "Remainder Server" /min cmd /c "pnpm dev:server >> server\data\server.log 2>&1"
    timeout /t 5 /nobreak >nul
) else (
    echo Server already running, skip.
)

tasklist /fi "imagename eq remainder.exe" | findstr /i "remainder.exe" >nul
if errorlevel 1 (
    echo Starting Remainder app...
    start "" "C:\projects\remainder\desktop\src-tauri\target\release\remainder.exe"
) else (
    echo App already running, skip.
)
