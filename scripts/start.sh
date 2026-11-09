#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$HOME/.civicwatch"
cd "$ROOT"

if [[ ! -x "$ROOT/.venv/bin/python" || ! -x "$ROOT/node_modules/.bin/vite" ]]; then
  echo "CivicWatch is not installed yet. Run ./scripts/setup-mac.sh first."
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22 is missing. Run ./scripts/setup-mac.sh."
  exit 1
fi
if [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -ne 22 ]]; then
  if command -v brew >/dev/null 2>&1 && [[ -d "$(brew --prefix node@22 2>/dev/null || true)" ]]; then
    export PATH="$(brew --prefix node@22)/bin:$PATH"
  fi
fi

mkdir -p "$DATA"
if curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1 && curl -fsS http://127.0.0.1:5173 >/dev/null 2>&1; then
  open http://127.0.0.1:5173
  echo "CivicWatch is already running at http://127.0.0.1:5173"
  exit 0
fi
for port in 8000 5173; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use. Stop the other app or close it before starting CivicWatch."
    exit 1
  fi
done

cd "$ROOT/services/api"
nohup "$ROOT/.venv/bin/python" run.py > "$DATA/api.log" 2>&1 &
echo $! > "$DATA/api.pid"

cd "$ROOT/apps/web"
nohup npm run dev -- --host 127.0.0.1 > "$DATA/web.log" 2>&1 &
echo $! > "$DATA/web.pid"

for attempt in $(seq 1 45); do
  if curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1 && curl -fsS http://127.0.0.1:5173 >/dev/null 2>&1; then
    open http://127.0.0.1:5173
    echo "CivicWatch is running at http://127.0.0.1:5173"
    echo "API diagnostics: http://127.0.0.1:8000/docs"
    echo "Logs: $DATA/api.log and $DATA/web.log"
    exit 0
  fi
  sleep 1
done

echo "CivicWatch did not start correctly."
echo "API log: $DATA/api.log"
echo "Web log: $DATA/web.log"
exit 1
