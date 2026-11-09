import { randomUUID } from "node:crypto";
import { requireAuth } from "./lib/security";
import { listJson, saveJson } from "./lib/storage";
import { ZONE_PREFIX, type Zone } from "./lib/models";

export async function GET(request: Request): Promise<Response> {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const zones = await listJson<Zone>(ZONE_PREFIX);
    zones.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return Response.json(zones, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load zones." }, { status: 500 });
  }
}
export async function POST(request: Request): Promise<Response> {
  const denied = requireAuth(request);
  if (denied) return denied;
  let body: { name?: unknown; zone_type?: unknown; camera_id?: unknown; points?: unknown; dwell_seconds?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid zone body." }, { status: 400 }); }
  const points = Array.isArray(body.points) ? body.points : [];
  const validPoints = points.length >= 3 && points.length <= 100 && points.every((point) =>
    Array.isArray(point) && point.length === 2 &&
    point.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1000)
  );
  if (!validPoints || typeof body.name !== "string" || !body.name.trim()) {
    return Response.json({ error: "A zone needs a name and at least three valid points." }, { status: 400 });
  }
  const dwellSeconds = Number(body.dwell_seconds ?? 20);
  if (!Number.isFinite(dwellSeconds) || dwellSeconds < 1 || dwellSeconds > 600) {
    return Response.json({ error: "Stillness threshold must be between 1 and 600 seconds." }, { status: 400 });
  }
  const zone: Zone = {
    id: randomUUID(), name: body.name.trim().slice(0, 120),
    zone_type: typeof body.zone_type === "string" ? body.zone_type.slice(0, 60) : "no_parking",
    camera_id: typeof body.camera_id === "string" ? body.camera_id.slice(0, 120) : "uploaded-video",
    points: points as number[][], dwell_seconds: dwellSeconds, createdAt: new Date().toISOString(),
  };
  await saveJson(ZONE_PREFIX + zone.id + ".json", zone);
  return Response.json(zone, { status: 201 });
}
