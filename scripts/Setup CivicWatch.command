#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
chmod +x scripts/setup-mac.sh scripts/start.sh scripts/stop.sh
./scripts/setup-mac.sh
echo
read -r -p "Setup finished. Press Enter to close this window…"
