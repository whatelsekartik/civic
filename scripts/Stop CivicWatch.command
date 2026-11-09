#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
chmod +x scripts/stop.sh
./scripts/stop.sh
read -r -p "Press Enter to close this window…"
