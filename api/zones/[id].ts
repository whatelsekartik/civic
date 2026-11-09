import { requireAuth } from "../lib/security";
import { deleteBlob, safeId } from "../lib/storage";
import { ZONE_PREFIX } from "../lib/models";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> | { id: string } }): Promise<Response> {
  const denied = requireAuth(request);
  if (denied) return denied;
  const params = await context.params;
  if (!safeId(params.id)) return Response.json({ error: "Invalid zone ID." }, { status: 400 });
  try {
    await deleteBlob(ZONE_PREFIX + params.id + ".json");
    return Response.json({ deleted: true });
  } catch {
    return Response.json({ error: "Zone could not be deleted." }, { status: 404 });
  }
}
