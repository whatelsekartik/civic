import { requireInternal } from "../lib/security";
import { readJson, safeId, saveJson } from "../lib/storage";
import { JOB_PREFIX, type Job } from "../lib/models";

export async function POST(request: Request): Promise<Response> {
  const denied = requireInternal(request);
  if (denied) return denied;
  let body: { jobId?: unknown; progress?: unknown; message?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid payload." }, { status: 400 }); }
  if (typeof body.jobId !== "string" || !safeId(body.jobId)) return Response.json({ error: "Invalid job ID." }, { status: 400 });
  const job = await readJson<Job>(JOB_PREFIX + body.jobId + ".json");
  if (!job || job.status === "completed" || job.status === "failed") return Response.json({ ok: true });
  const progress = typeof body.progress === "number" ? Math.max(0, Math.min(99, body.progress)) : job.progress;
  job.progress = progress;
  job.message = typeof body.message === "string" ? body.message.slice(0, 300) : job.message;
  job.status = "processing";
  job.updatedAt = new Date().toISOString();
  await saveJson(JOB_PREFIX + job.id + ".json", job);
  return Response.json({ ok: true });
}
