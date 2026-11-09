import { requireInternal } from "../lib/security";
import { readJson, saveJson } from "../lib/storage";
import { INCIDENT_PREFIX, JOB_PREFIX, type Incident, type Job } from "../lib/models";

type WorkerIncident = {
  id: string; title: string; category: string; location: string; camera: string;
  detected_at: string; confidence: number; severity: "Medium" | "High" | "Low";
  note: string; track_id?: string; evidence_image_base64?: string;
};
export async function POST(request: Request): Promise<Response> {
  const denied = requireInternal(request);
  if (denied) return denied;
  let body: { jobId?: unknown; ok?: unknown; message?: unknown; framesProcessed?: unknown; incidents?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid completion payload." }, { status: 400 }); }
  if (typeof body.jobId !== "string") return Response.json({ error: "Missing job ID." }, { status: 400 });
  const job = await readJson<Job>(JOB_PREFIX + body.jobId + ".json");
  if (!job) return Response.json({ error: "Job not found." }, { status: 404 });
  if (body.ok !== true) {
    job.status = "failed";
    job.error = typeof body.message === "string" ? body.message.slice(0, 500) : "Cloud inference failed.";
    job.message = job.error;
    job.updatedAt = new Date().toISOString();
    await saveJson(JOB_PREFIX + job.id + ".json", job);
    return Response.json({ ok: true });
  }
  const rawIncidents = Array.isArray(body.incidents) ? body.incidents.slice(0, 40) as WorkerIncident[] : [];
  for (const item of rawIncidents) {
    if (!item || typeof item.id !== "string" || !/^CW-[A-Z0-9-]{4,40}$/.test(item.id)) continue;
    const incident: Incident = {
      id: item.id, title: String(item.title || "Potential civic issue").slice(0, 180),
      category: String(item.category || "Potential obstruction").slice(0, 120),
      location: String(item.location || "Uploaded video").slice(0, 180),
      camera: "Uploaded CCTV recording", detected_at: String(item.detected_at || new Date().toISOString()),
      confidence: Math.max(0, Math.min(100, Number(item.confidence) || 0)), status: "Pending review",
      severity: item.severity === "High" || item.severity === "Low" ? item.severity : "Medium",
      note: String(item.note || "Automated candidate. Human verification required.").slice(0, 1000),
      source_job: job.id, track_id: typeof item.track_id === "string" ? item.track_id.slice(0, 80) : undefined,
      evidence_image_base64: typeof item.evidence_image_base64 === "string" && item.evidence_image_base64.length < 300_000
        ? item.evidence_image_base64 : undefined,
    };
    await saveJson(INCIDENT_PREFIX + incident.id + ".json", incident);
  }
  job.status = "completed";
  job.progress = 100;
  job.completedAt = new Date().toISOString();
  job.updatedAt = job.completedAt;
  job.message = String(Number(body.framesProcessed) || 0) + " frames processed · " + rawIncidents.length + " incident candidates";
  job.error = undefined;
  await saveJson(JOB_PREFIX + job.id + ".json", job);
  return Response.json({ ok: true });
}
