import { requireAuth } from "../lib/security";
import { readJson, safeId, saveJson } from "../lib/storage";
import { JOB_PREFIX, type Job } from "../lib/models";

export async function GET(request: Request, context: { params: Promise<{ id: string }> | { id: string } }): Promise<Response> {
  const denied = requireAuth(request);
  if (denied) return denied;
  const params = await context.params;
  if (!safeId(params.id)) return Response.json({ error: "Invalid job ID." }, { status: 400 });
  try {
    const job = await readJson<Job>(JOB_PREFIX + params.id + ".json");
    if (!job) return Response.json({ error: "Analysis job not found." }, { status: 404 });
    const timeout = Number(process.env.CIVICWATCH_SANDBOX_TIMEOUT_MS || 45 * 60 * 1000);
    if ((job.status === "processing" || job.status === "provisioning") && job.startedAt &&
        Date.now() - Date.parse(job.startedAt) > timeout + 2 * 60 * 1000) {
      job.status = "failed";
      job.error = "The cloud Sandbox reached its configured time limit.";
      job.message = job.error;
      job.updatedAt = new Date().toISOString();
      await saveJson(JOB_PREFIX + job.id + ".json", job);
    }
    return Response.json(job, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load job." }, { status: 500 });
  }
}
