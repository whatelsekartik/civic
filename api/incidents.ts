import { requireAuth } from "./lib/security";
import { listJson } from "./lib/storage";
import { INCIDENT_PREFIX, type Incident } from "./lib/models";

export async function GET(request: Request): Promise<Response> {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const incidents = await listJson<Incident>(INCIDENT_PREFIX);
    incidents.sort((a, b) => b.detected_at.localeCompare(a.detected_at));
    return Response.json(incidents.slice(0, 500), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load incidents." }, { status: 500 });
  }
}
