#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
PYTHON="${PYTHON:-python3}"
if ! command -v "$PYTHON" >/dev/null 2>&1; then echo 'Python 3 is required. Install it from python.org or Homebrew.'; exit 1; fi
if ! command -v node >/dev/null 2>&1; then echo 'Node.js 20+ is required. Install it from nodejs.org or Homebrew.'; exit 1; fi
if [ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 22 ]; then echo 'Node.js 22 or newer is required.'; exit 1; fi
if [ ! -d .venv ]; then "$PYTHON" -m venv .venv; fi
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r services/api/requirements.txt
npm install
mkdir -p models
if [ ! -f models/yolo26n.pt ]; then echo 'Downloading YOLO26 nano weights...'; curl -fL --retry 3 -o models/yolo26n.pt https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo26n.pt || { rm -f models/yolo26n.pt; echo 'Automatic model download failed. See docs/DEVELOPMENT.md.'; exit 1; }; fi
python - <<'PY'
from pathlib import Path
from ultralytics import YOLO
p=Path('models/yolo26n.pt')
assert p.exists() and p.stat().st_size > 100_000, 'Model weights look incomplete'
YOLO(str(p))
print('YOLO weights validated')
try:
 import torch
 print('PyTorch:', torch.__version__, '| MPS:', torch.backends.mps.is_available())
except Exception as e: print('PyTorch diagnostic:', e)
PY
echo 'CivicWatch setup complete. Run ./scripts/start.sh'
