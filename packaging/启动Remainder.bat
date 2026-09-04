@echo off
rem Remainder portable launcher
cd /d %~dp0

curl -s -o nul -w "%%{http_code}" http://127.0.0.1:3210/api/health | findstr "200" >nul
if errorlevel 1 (
    echo Starting Remainder server...
    start "Remainder Server" /min cmd /c "%~dp0node\node.exe %~dp0server\dist\index.js >> %~dp0server\data\server.log 2>&1"
    timeout /t 5 /nobreak >nul
) else (
    echo Server already running, skip.
)

start "" "%~dp0app\remainder.exe"
