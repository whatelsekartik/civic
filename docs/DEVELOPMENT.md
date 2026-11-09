# CivicWatch local development

## Architecture

- `apps/web`: React + Vite + TypeScript UI.
- `services/api`: FastAPI service, local upload handling, inference jobs and SQLite storage.
- `services/api/app/inference.py`: YOLO11 vehicle detection, ByteTrack tracking, zone checks and annotated-video output.
- `models/`: downloaded model weights (ignored by Git).
- `~/.civicwatch/`: local database, uploaded videos, annotated outputs and snapshots.

The browser and API run on the same Mac. Video is uploaded to `127.0.0.1:8000`, processed locally and retained under `~/.civicwatch/`. The frontend is served at `127.0.0.1:5173`.

## Tested runtime targets

- macOS on Apple Silicon recommended.
- Python 3.12 (the installer selects this version for compatible PyTorch wheels).
- Node.js 22.
- Homebrew.
- Internet access for dependency and YOLO model installation.

## Install once

From the repository root:

```bash
chmod +x scripts/*.sh
./scripts/setup-mac.sh
```

The script installs Python 3.12 and Node.js 22 with Homebrew when necessary, creates `.venv`, installs `services/api/requirements.txt`, installs the npm workspace and downloads/validates `models/yolo11n.pt`.

## Start and stop

```bash
./scripts/start.sh
./scripts/stop.sh
```

Open:
- Dashboard: http://127.0.0.1:5173
- API health: http://127.0.0.1:8000/api/health
- Interactive API docs: http://127.0.0.1:8000/docs

Logs and PID files are stored in `~/.civicwatch/`. To inspect a startup failure:

```bash
tail -n 100 ~/.civicwatch/api.log
tail -n 100 ~/.civicwatch/web.log
```

## Video analysis workflow

1. Select a video in **Analyse video**.
2. Click the preview to add polygon vertices around the area of interest.
3. Save the zone and select it for analysis.
4. Upload the video. The API responds with a job ID and processes the video in a background task.
5. The UI polls job progress. The annotated MP4 is available from `GET /api/jobs/{job_id}/video`.
6. Potential candidates are saved in SQLite and shown in **Incidents**. Status changes are persisted and audited.

The `zone_ids` form field is a JSON array of saved zone IDs. Zone points are normalised to the 0–1000 range and scaled to the uploaded video's dimensions by the inference worker.

## Configuration

Optional environment variables:

- `CIVICWATCH_DATA_DIR`: local data directory (default `~/.civicwatch`).
- `CIVICWATCH_DB_PATH`: SQLite database path.
- `CIVICWATCH_MAX_UPLOAD_BYTES`: upload limit in bytes (default 500 MiB).
- `CIVICWATCH_VEHICLE_MODEL`: path to an alternate Ultralytics-compatible vehicle model.
- `CIVICWATCH_CORS_ORIGINS`: comma-separated allowed origins (defaults to local Vite origins).
- `CIVICWATCH_HOST` / `CIVICWATCH_PORT`: API bind address and port. Keep the host on `127.0.0.1`.

## Troubleshooting

- **The dashboard says “Local API offline”:** run `./scripts/start.sh`, then check `~/.civicwatch/api.log`. Test `http://127.0.0.1:8000/api/health`.
- **Port 8000 or 5173 is busy:** stop the process using that port or close the other app, then start CivicWatch again.
- **Python / torch installation fails:** make sure setup uses Python 3.12. Delete `.venv` and rerun `./scripts/setup-mac.sh` if it was created with an unsupported Python version.
- **The model is missing:** rerun `./scripts/setup-mac.sh`; it downloads and validates YOLO11 nano weights.
- **A video cannot be opened:** re-export it as MP4 using H.264 video encoding and try again.
- **No candidates are found:** confirm that a polygon zone was saved and selected, that it matches the video camera angle, and that the vehicle remains still inside that area long enough to pass the configured threshold.

## Limitations and safety

- Stillness is a pixel-displacement heuristic, not calibrated speed. Different camera angles, zoom levels, frame rates and perspectives require tuning.
- Only the vehicle classes from the general YOLO model are used for zone-based candidates. Pothole and waste detection require separate weights and are reported as unavailable.
- A detected candidate is not proof of an offence. Human verification is mandatory.
- This first MVP does not include a live RTSP camera connector, public multi-user deployment, automatic challans or automated department forwarding.
- Do not connect cameras unless you are authorised to access those feeds. Do not expose the local API to the internet.

## Vercel deployment

Vercel serves the static Vite frontend only. It does not run this local FastAPI process, access local video files, provide a GPU or ingest private RTSP streams. For the actual upload-and-analysis workflow, run both services on the local Mac using the instructions above. The deployed page is only a frontend preview until a separately secured backend is provisioned.
