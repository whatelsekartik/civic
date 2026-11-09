# Vercel deployment checklist

This document describes the cloud-only deployment. You do not need to run Python, Node, a local FastAPI server or a model on your Mac after the deployment is configured.

## 1. Import the repository

1. Open Vercel and choose **Add New → Project**.
2. Import whatelsekartik/civic.
3. Set the Root Directory to the repository root (leave it as ./).
4. Keep the Framework Preset as **Vite** (or let Vercel detect it).
5. Build settings are already in vercel.json:
   - Install: npm install
   - Build: npm run build
   - Output: apps/web/dist
6. Use Node.js 22 for the project build.
7. Deploy once. The app will show a setup screen until the storage and environment settings are complete.

## 2. Create Private Blob storage

1. Open the Vercel project's **Storage** tab.
2. Choose **Create Database → Blob**.
3. Select **Private** access (do not choose Public).
4. Create and connect the store to this CivicWatch project.
5. Ensure BLOB_READ_WRITE_TOKEN is added to the project for Production and Preview.

The server uses this token to create restricted client-upload tokens and to read/write private data. It must never be placed in a VITE_* variable or sent to the browser.

## 3. Enable Vercel Queues

CivicWatch publishes each video job to the civicwatch-analysis topic. The consumer is defined in api/queues/analyse.ts and registered in vercel.json with a queue/v2beta trigger.

Enable/activate Vercel Queues for your Vercel account if prompted. You do not need to expose the consumer as a public endpoint; the Queue trigger makes it an internal push consumer.

## 4. Add environment variables

Open **Project → Settings → Environment Variables** and add the following to Production and Preview:

| Name | Value |
|---|---|
| CIVICWATCH_ACCESS_KEY | A strong shared password used to enter the dashboard |
| CIVICWATCH_SESSION_SECRET | A unique random secret, at least 32 characters |
| CIVICWATCH_INTERNAL_SECRET | A different unique random secret for worker-to-API callbacks |
| CIVICWATCH_SANDBOX_VCPUS | Optional; use 2 to start (allowed: 1, 2, 4) |
| CIVICWATCH_SANDBOX_TIMEOUT_MS | Optional; use 2700000 on Hobby (45 minutes) |

Generate separate random secrets with a password manager or secrets generator. Do not reuse your access key as either signing secret.

Vercel supplies VERCEL_URL and Sandbox OIDC in production. No Vercel access token needs to be hardcoded for Sandbox creation.

## 5. Redeploy and sign in

After adding environment variables and connecting Blob, redeploy the latest commit. Open the deployment URL. If the setup screen still appears, check that all three CivicWatch secrets and BLOB_READ_WRITE_TOKEN are present in the environment used by that deployment.

The public health endpoint is:

https://YOUR-PROJECT.vercel.app/api/health

It should return JSON containing "ok": true. This only checks that the Function is deployed; it does not prove that Blob, Queues or Sandbox are ready. Sign in and check **System status** for the Blob connection.

## 6. Run a short test video

1. Sign in using CIVICWATCH_ACCESS_KEY.
2. Choose a short MP4 road recording.
3. Draw a zone by clicking at least three points in the video preview.
4. Save the zone and select it.
5. Choose **Upload & analyse in Vercel**.
6. Check the upload progress, job status, annotated video download and incident desk.

The uploaded recording is transferred directly from the browser to private Blob. The API only creates the job and sends a small message to Queues. A Python 3.13 Sandbox downloads the source through a short-lived signed URL, processes it on CPU, uploads the annotated video to private Blob and posts a completion callback.

## 7. Troubleshooting

**Setup screen says cloud access is not configured**
- Confirm CIVICWATCH_ACCESS_KEY, CIVICWATCH_SESSION_SECRET, CIVICWATCH_INTERNAL_SECRET and BLOB_READ_WRITE_TOKEN are set in the environment being viewed.
- Redeploy after changing environment variables.

**Upload token fails**
- Confirm the Blob store is Private and connected to this project.
- Confirm BLOB_READ_WRITE_TOKEN is available in the deployment environment.
- Confirm that the file is MP4, MOV, AVI, MKV or M4V and below the 500 MB client limit.

**Job remains queued**
- Confirm Vercel Queues is enabled.
- Check that the civicwatch-analysis trigger appears in the deployed project's function configuration.
- Check Function logs for api/jobs and api/queues/analyse.

**Sandbox fails to start**
- Check the Function logs for the Queue consumer.
- Confirm Sandbox is enabled for the Vercel team/project and the deployment has OIDC access.
- Keep CIVICWATCH_SANDBOX_VCPUS at 2 while testing.

**Inference fails or times out**
- Try a shorter MP4 with a lower resolution.
- Check that Sandbox timeouts match the selected plan. Hobby permits a maximum 45-minute session.
- The first run installs PyTorch, Ultralytics, OpenCV and FFmpeg and downloads YOLO weights, so it takes longer than subsequent frame processing.
- Inspect Sandbox logs in the Vercel project.

**Video plays but no incident appears**
- A zone must be saved and selected.
- Reuse a zone only with footage from the same fixed camera angle.
- Current detection looks for common vehicles that stay within the polygon. It is not a pothole, waste, face or speed-enforcement model.

## 8. Current boundaries

- No local processes are required for the Vercel deployment.
- No live RTSP camera connector exists yet; the current input is uploaded video.
- The Sandbox is CPU-only in this implementation.
- The shared access key is suitable for a private pilot, not public multi-user production.
- Every incident is a potential issue, not proof of an offence. Human verification is mandatory.
