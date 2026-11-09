# CivicWatch

**CivicWatch is a Vercel-hosted civic video review prototype.** Upload recorded road/CCTV footage, draw monitoring zones, run vehicle detection in an isolated cloud Sandbox, then review potential incident candidates and annotated footage.

There is no Mac-side service in the cloud deployment. The browser, API, private file storage, queue and Python inference worker all run through Vercel.

## Deploy and configure Vercel

1. Import this GitHub repository into Vercel: https://github.com/whatelsekartik/civic. Keep the project root at the repository root. The checked-in vercel.json configures the Vite build, API functions and the private Queue consumer.
2. In the project's **Storage** tab, create a **Private Vercel Blob** store and connect it to this project. Vercel adds BLOB_READ_WRITE_TOKEN to the selected environments. This is required for private file operations and secure browser-upload tokens.
3. Enable Vercel Queues for the project/account if the dashboard prompts you. The route api/queues/analyse.ts is registered as a push consumer for the civicwatch-analysis topic.
4. In **Project → Settings → Environment Variables**, add these variables to Production and Preview:

   | Variable | What to set |
   |---|---|
   | CIVICWATCH_ACCESS_KEY | A strong private sign-in key you choose |
   | CIVICWATCH_SESSION_SECRET | A separate random secret with at least 32 characters |
   | CIVICWATCH_INTERNAL_SECRET | Another separate random secret, used only for Sandbox callbacks |
   | CIVICWATCH_SANDBOX_VCPUS | Optional: 2 (supported settings: 1, 2 or 4) |
   | CIVICWATCH_SANDBOX_TIMEOUT_MS | Optional: 2700000 (45 minutes, the Hobby Sandbox maximum) |

   Do not add secret values to GitHub or the source code. Keep BLOB_READ_WRITE_TOKEN server-side; the browser receives only a constrained upload token.
5. Redeploy after connecting Blob and setting the environment variables.

For a click-by-click setup and troubleshooting checklist, see docs/VERCEL_DEPLOYMENT.md.

## Use CivicWatch

1. Open the deployed Vercel URL and sign in with your CIVICWATCH_ACCESS_KEY.
2. Open **Analyse video** and select an MP4, MOV, AVI, MKV or M4V road recording (maximum 500 MB in this prototype).
3. Click at least three points on the video preview to draw a polygon around the zone to monitor.
4. Name the zone, set its category and stillness threshold, save it, and select it for this recording.
5. Click **Upload & analyse in Vercel**. The browser uploads directly to private Blob; a Queue message starts a Python 3.13 Sandbox.
6. Track the job, download the annotated MP4 and review candidate incidents in **Incident desk**.

The Vercel Sandbox runs YOLO11 nano and ByteTrack on CPU. The prototype creates candidate incidents for tracked vehicles that remain still inside a selected zone. It uses pixel movement as a heuristic; it is not calibrated speed measurement.

## Cloud architecture

- **Vercel Functions:** authenticated API, job state, zone and incident endpoints.
- **Private Vercel Blob:** uploaded recordings, JSON records, evidence snapshots and annotated videos.
- **Vercel Queues:** durable background-job delivery and retries.
- **Vercel Sandbox:** isolated Python 3.13 runtime that installs the CPU vision stack and processes the video.
- **React + Vite:** dashboard and video review UI.

## What is not implemented yet

- The detector currently handles common vehicles from the general YOLO model. Dedicated pothole and waste models are **not installed**.
- No live RTSP/NVR camera connector is included. Upload a recording you are authorised to access.
- Stillness is estimated through pixel displacement; no calibrated road speed or legal offence determination is made.
- Incidents are review candidates only. An operator must verify evidence before anything is forwarded.
- The login is a **single shared access key**, not per-person accounts or role-based access control.
- This is a prototype data model using JSON records in Blob, not a multi-tenant relational database or production audit system.

## Runtime and cost considerations

Cloud inference uses CPU, not a GPU. Vercel Sandbox sessions on Hobby have a 45-minute maximum and up to 4 vCPUs (2 GB RAM per vCPU). Large recordings or first-run package installation can take substantial time; start with short, low-resolution clips. Sandbox CPU, memory and storage usage can incur charges or exhaust included usage. Review your Vercel plan and current usage before processing a large batch.

## Privacy and safety

Use a **Private** Blob store. Only upload footage you are authorised to process. The app does not use face recognition or issue challans. Keep access keys private, review retention requirements, and require a human decision before forwarding any incident.
