#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
chmod +x scripts/start.sh scripts/stop.sh
./scripts/start.sh
echo
read -r -p "CivicWatch was started in the background. Press Enter to close this window…"
