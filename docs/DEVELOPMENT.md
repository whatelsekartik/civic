# CivicWatch development

## Architecture

The repository is intentionally split into a browser-based dashboard and a local-first inference service.

- `apps/web`: React + Vite + TypeScript user interface.
- `services/api`: FastAPI, SQLite persistence, video processing and local model inference.
- `models/`: local model weights; do not commit model files.
- `~/.civicwatch/`: runtime database, uploaded footage, outputs and logs.

Existing authorised CCTV/NVR feeds are the primary planned input. A future CivicBot mobile robot is an optional additional source, not required by the MVP.

## Requirements

- macOS Apple Silicon recommended for MPS acceleration; CPU fallback is supported.
- Python 3.11 or newer (use a tested version supported by PyTorch/Ultralytics).
- Node.js 20 or newer.
- Internet for initial dependency and model download.

## Setup

Double-click `scripts/Setup CivicWatch.command`, or run:

```bash
chmod +x scripts/*.sh
./scripts/setup-mac.sh
```

The setup script creates a virtual environment, installs API and web dependencies, downloads YOLO26 nano weights and checks model loading and device availability.

## Run

Double-click `scripts/Start CivicWatch.command`, or run:

```bash
./scripts/start.sh
```

Dashboard: http://127.0.0.1:5173
API docs: http://127.0.0.1:8000/docs

Stop using `scripts/Stop CivicWatch.command` or `./scripts/stop.sh`.

## API

- `GET /api/health`
- `GET /api/system`
- `GET /api/incidents`
- `PATCH /api/incidents/{id}/status`
- `GET /api/zones`, `POST /api/zones`, `DELETE /api/zones/{id}`
- `POST /api/jobs/analyse`
- `GET /api/jobs/{id}`
- `GET /api/audit`

## Important current limitations

- The current web application includes a clearly labelled illustrative UI. Connect the API client and replace sample records before treating any displayed incident as live data.
- The current video-analysis endpoint uses the installed YOLO model for object tracking and configured polygon dwell rules. The first implementation does not yet implement robust stationary-speed estimation, calibrated camera geometry, legal rule interpretation, or a full interactive camera connector.
- Pothole and waste models are deliberately reported as not installed. Do not infer these categories from generic pretrained weights.
- RTSP credentials, camera authorisation, retention and access control require deployment-specific review before any real camera is connected.
- The initial data store is a single-operator local SQLite database. Do not expose this service to a public network.

## Vercel deployment

The browser UI may be deployed independently. The FastAPI inference service is designed to run locally or on a trusted machine with access to the cameras. Do not deploy live video inference as a long-running Vercel serverless request. A future cloud sync adapter can send verified incident metadata and selected evidence to a hosted API/database.
