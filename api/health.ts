export async function GET(): Promise<Response> {
  return Response.json({ ok: true, service: "civicwatch-vercel", platform: "Vercel", timestamp: new Date().toISOString() });
}
