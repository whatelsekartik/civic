import { requireAuth } from "./lib/security";
import { requireBlobStore } from "./lib/storage";

export async function GET(request: Request): Promise<Response> {
  const denied = requireAuth(request);
  if (denied) return denied;
  let blobConfigured = false;
  try { requireBlobStore(); blobConfigured = true; } catch { blobConfigured = false; }
  return Response.json({
    platform: "Vercel", mode: "cloud-first",
    storage: blobConfigured ? "private Vercel Blob" : "not_configured",
    queue: "Vercel Queues", compute: "Vercel Sandbox · Python 3.13 · CPU",
    sandboxTimeoutMs: Number(process.env.CIVICWATCH_SANDBOX_TIMEOUT_MS || 45 * 60 * 1000),
    sandboxVcpus: Number(process.env.CIVICWATCH_SANDBOX_VCPUS || 2),
    models: {
      detector: "YOLO11 nano (downloaded inside each Sandbox)", tracking: "ByteTrack", device: "CPU",
      specialised_models: { pothole: "not_installed", waste: "not_installed" },
    },
  });
}
