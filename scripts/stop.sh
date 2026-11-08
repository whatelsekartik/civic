#!/bin/bash
set -euo pipefail
DATA="$HOME/.civicwatch"
for name in api web; do
  file="$DATA/$name.pid"
  if [ -f "$file" ]; then
    pid="$(cat "$file")"
    if kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null || true; fi
    rm -f "$file"
  fi
done
for port in 8000 5173; do
  pid="$(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pid" ]; then kill $pid 2>/dev/null || true; fi
done
echo 'CivicWatch stop requested.'
