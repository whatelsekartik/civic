#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
mkdir -p "$HOME/.civicwatch"
if lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then echo 'Port 8000 is already in use. Stop that process or change CIVICWATCH_PORT.'; exit 1; fi
if lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then echo 'Port 5173 is already in use. Stop that process or change the frontend port.'; exit 1; fi
source .venv/bin/activate
(cd services/api && nohup python run.py > "$HOME/.civicwatch/api.log" 2>&1 & echo $! > "$HOME/.civicwatch/api.pid")
(cd apps/web && nohup npm run dev -- --host 127.0.0.1 > "$HOME/.civicwatch/web.log" 2>&1 & echo $! > "$HOME/.civicwatch/web.pid")
for i in $(seq 1 40); do if curl -fsS http://127.0.0.1:8000/api/health >/dev/null && curl -fsS http://127.0.0.1:5173 >/dev/null; then open http://127.0.0.1:5173; echo 'CivicWatch is running at http://127.0.0.1:5173'; exit 0; fi; sleep 1; done
echo 'Startup health check failed. Inspect ~/.civicwatch/api.log and web.log.'
exit 1
