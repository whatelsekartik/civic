#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This setup script is for macOS. See docs/DEVELOPMENT.md for other systems."
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required. Install it from https://brew.sh and run this script again."
  exit 1
fi

if ! command -v python3.12 >/dev/null 2>&1; then
  echo "Installing Python 3.12 (supported by the current PyTorch wheels)…"
  brew install python@3.12
fi
PYTHON_BIN="$(brew --prefix python@3.12)/bin/python3.12"
if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="$(command -v python3.12)"
fi

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -ne 22 ]]; then
  echo "Installing Node.js 22…"
  brew install node@22
fi
export PATH="$(brew --prefix node@22)/bin:$PATH"

PYTHON_VERSION="$("$PYTHON_BIN" -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')"
NODE_VERSION="$(node -p 'process.versions.node')"
echo "Using Python $PYTHON_VERSION and Node $NODE_VERSION"

if [[ -d .venv ]] && ! .venv/bin/python -c 'import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 1)' 2>/dev/null; then
  echo "Recreating the virtual environment with Python 3.12…"
  rm -rf .venv
fi
"$PYTHON_BIN" -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r services/api/requirements.txt
npm install

mkdir -p models
if [[ ! -f models/yolo11n.pt ]]; then
  echo "Downloading YOLO11 nano weights (this is a one-time download)…"
  python - <<'PY'
from pathlib import Path
import shutil
from ultralytics import YOLO

weights = Path("yolo11n.pt")
model = YOLO("yolo11n.pt")
source = Path(getattr(model, "ckpt_path", weights))
if source.is_file() and source.resolve() != Path("models/yolo11n.pt").resolve():
    shutil.copy2(source, "models/yolo11n.pt")
elif weights.is_file():
    shutil.copy2(weights, "models/yolo11n.pt")
assert Path("models/yolo11n.pt").is_file(), "YOLO weights were not downloaded"
YOLO("models/yolo11n.pt")
print("YOLO11 nano weights downloaded and validated.")
PY
fi

python - <<'PY'
import torch
print("PyTorch:", torch.__version__)
print("Apple Metal (MPS) available:", torch.backends.mps.is_available())
PY

echo
echo "CivicWatch setup complete."
echo "Start it with: ./scripts/start.sh"
