# CivicWatch cloud development

## Deployment model

The production UI and application API are deployed to Vercel. The cloud path is:

1. React/Vite browser UI authenticates with a signed CivicWatch session cookie.
2. The browser uploads the recording directly to **Private Vercel Blob** through a constrained client-upload token.
3. The API validates the private Blob object, saves a job manifest and publishes a message to Vercel Queues.
4. A private Queue consumer creates a Vercel Sandbox running Python 3.13.
5. The Sandbox downloads the video through a short-lived signed URL, runs YOLO11 nano + ByteTrack on CPU, applies configured polygon-zone rules, and renders an annotated MP4.
6. The Sandbox uploads the output to private Blob and calls authenticated progress/completion routes.
7. The dashboard polls job status and reads incident records.

## Source layout

- apps/web: React + Vite dashboard, cloud auth and direct-to-Blob upload.
- api/: Vercel Functions for auth, Blob upload tokens, jobs, zones, incidents and Queue callbacks.
- api/queues/analyse.ts: Vercel Queues push consumer; creates the Sandbox.
- api/lib/worker-source.ts: Python worker source installed into the ephemeral Sandbox.
- services/api/: retained local FastAPI prototype; **not used by the Vercel cloud deployment**.
- scripts/: retained local prototype launchers; **not used by the Vercel cloud deployment**.

See VERCEL_DEPLOYMENT.md for the setup guide.

## Vercel services required

- Private Vercel Blob with BLOB_READ_WRITE_TOKEN connected to the project.
- Vercel Queues enabled; the civicwatch-analysis consumer is registered in vercel.json.
- Vercel Sandbox enabled for the team/project.
- Environment variables: CIVICWATCH_ACCESS_KEY, CIVICWATCH_SESSION_SECRET, CIVICWATCH_INTERNAL_SECRET.
- Optional: CIVICWATCH_SANDBOX_VCPUS (1, 2 or 4) and CIVICWATCH_SANDBOX_TIMEOUT_MS.

## Local development

The Vercel-native application uses the Vercel runtime APIs for authentication, Blob, Queues and Sandbox. Local execution of those services requires Vercel project credentials and the Vercel CLI; the deployment is the reference environment. The old FastAPI app in services/api remains for local inference experiments but it is not the production backend.

## Detection scope and limitations

- YOLO11 nano detects common COCO road objects; only vehicle classes are used for zone-based incident candidates.
- The stillness detector uses short-window pixel displacement, not calibrated speed or world-coordinate measurement.
- The zone polygon is normalised to the 0–1000 coordinate range and is tied to one fixed camera view.
- Dedicated pothole and waste models, live RTSP/NVR ingestion, multi-user role-based access, automatic department forwarding and automatic challans are not included.
- Human verification is mandatory before forwarding a candidate.

## Safety and privacy

- Use Private Blob, not Public Blob.
- The browser only receives a constrained Blob client token, never the store's read-write token.
- API endpoints require a signed HttpOnly session cookie; worker callbacks use a separate internal bearer secret.
- Only upload camera footage you are authorised to access.
- The inference Sandbox currently has outbound internet access to install its Python packages and download model weights.
