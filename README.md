# CivicWatch

**A local-first civic monitoring prototype.** Use recorded road CCTV footage, define monitoring zones, run vehicle detection and tracking on your Mac, then review potential incidents.

The MVP is designed around authorised existing CCTV/NVR infrastructure. CivicBot is a possible future extension; it is not required to use this app.

## Run it on macOS

1. Download this repository as a ZIP and extract it, or clone it:
   `git clone https://github.com/whatelsekartik/civic.git`
2. Open Terminal and move into the extracted `civic` folder.
3. Run the one-time installer:

   ```bash
   chmod +x scripts/*.sh
   ./scripts/setup-mac.sh
   ```

4. Start the app:

   ```bash
   ./scripts/start.sh
   ```

5. Open **http://127.0.0.1:5173**. To stop it, run `./scripts/stop.sh`.

The installer provisions Python 3.12 and Node.js 22 (using Homebrew if needed), installs dependencies and downloads the YOLO11 nano model. The first installation needs an internet connection. It can take a while because PyTorch and the model weights are large.

You can also double-click the three `.command` launchers inside the `scripts/` folder after macOS allows them to run.

## The first video

1. Open **Analyse video** and choose an MP4, MOV, AVI, MKV or M4V recording (up to 500 MB by default).
2. In the video preview, click at least three points around the area to monitor.
3. Name the zone, choose its type and stillness threshold, then select **Save drawn zone**.
4. Select the zone and click **Upload & analyse video**.
5. Watch the progress panel. When complete, download the annotated MP4 and review any incident candidates in **Incident desk**.

Zones use normalised coordinates and should only be reused with footage from the same fixed camera position and framing. Without a zone, the app can annotate tracked vehicles but will not create zone-based incident candidates.

## What is included

- React + Vite dashboard connected to a local FastAPI API.
- Local video upload, background analysis jobs and progress polling.
- YOLO11 vehicle detection and ByteTrack object tracking.
- Click-to-draw polygon zones and zone dwell/stillness candidate rules.
- Annotated video output, evidence snapshots, SQLite incidents and status review.
- CSV export of the incident desk.
- Local runtime diagnostics at **http://127.0.0.1:8000/docs**.

## Important limitations

- Vehicle stillness is estimated using pixel displacement over a short tracking window. It is **not calibrated speed measurement** and should be tuned for each camera.
- Candidates are not legally established offences. A person must inspect evidence before any report is forwarded.
- The included pretrained model detects common objects such as cars, motorcycles, buses and trucks. Dedicated pothole and waste models are not installed.
- Live RTSP camera ingestion, multi-user access control, calibrated speed detection, automatic department forwarding and CivicBot hardware are not implemented in this MVP.
- Video and SQLite data stay on the local machine under `~/.civicwatch/`; model weights are stored in the repository's ignored `models/` directory.

## Vercel

Vercel can host the static dashboard preview, but it does **not** run the local FastAPI video processor or access your Mac's files/cameras. Use the local startup steps above for the working upload and inference workflow. Do not expose the local API publicly.

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for architecture, troubleshooting and configuration.
