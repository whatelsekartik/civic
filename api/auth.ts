import { authConfigured, clearSessionCookie, createSessionCookie, isAuthenticated, verifyAccessKey } from "./lib/security";

export async function GET(request: Request): Promise<Response> {
  return Response.json({ configured: authConfigured(), authenticated: isAuthenticated(request) });
}
export async function POST(request: Request): Promise<Response> {
  if (!authConfigured()) {
    return Response.json({ error: "Set CIVICWATCH_ACCESS_KEY, CIVICWATCH_SESSION_SECRET, CIVICWATCH_INTERNAL_SECRET and connect a private Blob store in Vercel project settings." }, { status: 503 });
  }
  let body: { accessKey?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  if (typeof body.accessKey !== "string" || !verifyAccessKey(body.accessKey)) {
    return Response.json({ error: "That access key is incorrect." }, { status: 401 });
  }
  return Response.json({ authenticated: true }, {
    headers: { "Set-Cookie": createSessionCookie(), "Cache-Control": "no-store" },
  });
}
export async function DELETE(): Promise<Response> {
  return Response.json({ authenticated: false }, {
    headers: { "Set-Cookie": clearSessionCookie(), "Cache-Control": "no-store" },
  });
}
