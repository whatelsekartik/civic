import { requireAuth } from "../lib/security";
import { readJson, safeId, saveJson } from "../lib/storage";
import { INCIDENT_PREFIX, type Incident, type IncidentStatus } from "../lib/models";

const ALLOWED = new Set<IncidentStatus>(["Pending review", "Verified", "Forwarded", "Resolved", "Dismissed"]);
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> | { id: string } }): Promise<Response> {
  const denied = requireAuth(request);
  if (denied) return denied;
  const params = await context.params;
  if (!safeId(params.id)) return Response.json({ error: "Invalid incident ID." }, { status: 400 });
  let body: { status?: unknown; note?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  if (typeof body.status !== "string" || !ALLOWED.has(body.status as IncidentStatus)) {
    return Response.json({ error: "Invalid incident status." }, { status: 400 });
  }
  const pathname = INCIDENT_PREFIX + params.id + ".json";
  const incident = await readJson<Incident>(pathname);
  if (!incident) return Response.json({ error: "Incident not found." }, { status: 404 });
  incident.status = body.status as IncidentStatus;
  if (typeof body.note === "string") incident.note = body.note.slice(0, 1000);
  await saveJson(pathname, incident);
  return Response.json({ id: incident.id, status: incident.status });
}
