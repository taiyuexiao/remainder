@echo off
rem Remainder launcher: start backend server (if not running) + desktop app
cd /d C:\projects\remainder

curl -s -o nul -w "%%{http_code}" http://127.0.0.1:3210/api/health | findstr "200" >nul
if errorlevel 1 (
    echo Starting Remainder server...
    if exist server\dist\index.js (
        start "Remainder Server" /min cmd /c "node server\dist\index.js >> server\data\server.log 2>&1"
    ) else (
        start "Remainder Server" /min cmd /c "pnpm dev:server >> server\data\server.log 2>&1"
    )
    timeout /t 5 /nobreak >nul
) else (
    echo Server already running, skip.
)

rem Always launch the exe: if already running, the single-instance plugin
rem brings the main window to front and the second process exits itself.
start "" "C:\projects\remainder\desktop\src-tauri\target\release\remainder.exe"
