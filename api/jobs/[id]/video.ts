import { get } from "@vercel/blob";
import { requireAuth } from "../../lib/security";
import { readJson, safeId } from "../../lib/storage";
import { JOB_PREFIX, type Job } from "../../lib/models";

export async function GET(request: Request, context: { params: Promise<{ id: string }> | { id: string } }): Promise<Response> {
  const denied = requireAuth(request);
  if (denied) return denied;
  const params = await context.params;
  if (!safeId(params.id)) return Response.json({ error: "Invalid job ID." }, { status: 400 });
  const job = await readJson<Job>(JOB_PREFIX + params.id + ".json");
  if (!job || job.status !== "completed") return Response.json({ error: "Annotated video is not ready." }, { status: 404 });
  const blob = await get(job.outputPath, { access: "private" });
  if (!blob || blob.statusCode !== 200) return Response.json({ error: "Annotated video was not found." }, { status: 404 });
  return new Response(blob.stream, {
    headers: {
      "Content-Type": blob.blob.contentType || "video/mp4",
      "Content-Disposition": "attachment; filename=civicwatch-" + job.id + ".mp4",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
