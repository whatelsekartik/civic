import { randomUUID } from "node:crypto";
import { send } from "@vercel/queue";
import { requireAuth } from "./lib/security";
import { blobMetadata, listJson, readJson, saveJson, safeId } from "./lib/storage";
import { JOB_PREFIX, type Job, type Zone } from "./lib/models";

const ALLOWED_VIDEO = /\.(mp4|mov|avi|mkv|m4v)$/i;
export async function GET(request: Request): Promise<Response> {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const jobs = await listJson<Job>(JOB_PREFIX);
    jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return Response.json(jobs.slice(0, 100), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load jobs." }, { status: 500 });
  }
}
export async function POST(request: Request): Promise<Response> {
  const denied = requireAuth(request);
  if (denied) return denied;
  let body: { pathname?: unknown; filename?: unknown; zoneIds?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid job request." }, { status: 400 }); }
  const pathname = typeof body.pathname === "string" ? body.pathname : "";
  const filename = typeof body.filename === "string" ? body.filename : "road-footage.mp4";
  const zoneIds = Array.isArray(body.zoneIds) ? body.zoneIds : [];
  if (!pathname.startsWith("civicwatch/uploads/") || !ALLOWED_VIDEO.test(filename) || !ALLOWED_VIDEO.test(pathname) ||
      !zoneIds.every((id) => typeof id === "string" && safeId(id)) || zoneIds.length > 30) {
    return Response.json({ error: "Invalid uploaded video or monitoring zones." }, { status: 400 });
  }
  try {
    const metadata = await blobMetadata(pathname);
    if (!metadata || metadata.size <= 0 || metadata.size > 500 * 1024 * 1024) {
      return Response.json({ error: "The uploaded video is empty or exceeds 500 MB." }, { status: 400 });
    }
    for (const id of zoneIds as string[]) {
      const zone = await readJson<Zone>("civicwatch/zones/" + id + ".json");
      if (!zone) return Response.json({ error: "Monitoring zone " + id + " no longer exists." }, { status: 400 });
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    const job: Job = {
      id, filename, sourcePath: pathname, outputPath: "civicwatch/outputs/" + id + "-annotated.mp4",
      zoneIds: zoneIds as string[], status: "queued", progress: 0,
      message: "Video uploaded securely. Waiting for a cloud worker.", createdAt: now, updatedAt: now,
    };
    await saveJson(JOB_PREFIX + id + ".json", job);
    try {
      await send("civicwatch-analysis", { jobId: id }, { idempotencyKey: id, retentionSeconds: 24 * 60 * 60 });
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Queue submission failed.";
      job.message = "The upload is stored, but the cloud job could not be queued.";
      job.updatedAt = new Date().toISOString();
      await saveJson(JOB_PREFIX + id + ".json", job);
      return Response.json({ error: job.message, job }, { status: 503 });
    }
    return Response.json(job, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create the analysis job." }, { status: 500 });
  }
}
