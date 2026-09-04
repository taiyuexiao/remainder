#!/bin/bash
# Remainder portable launcher (macOS / Linux)
cd "$(dirname "$0")"

if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3210/api/health | grep -q 200; then
  echo "Server already running, skip."
else
  echo "Starting Remainder server..."
  mkdir -p server/data
  nohup ./node/node server/dist/index.js >> server/data/server.log 2>&1 &
  sleep 4
fi

open ./app/Remainder.app 2>/dev/null || ./app/remainder &
