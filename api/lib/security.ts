import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "cw_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function sessionSecret(): string {
  const secret = process.env.CIVICWATCH_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("CIVICWATCH_SESSION_SECRET must contain at least 32 characters.");
  return secret;
}
function signature(expiresAt: number): string {
  return createHmac("sha256", sessionSecret()).update("civicwatch-session:" + expiresAt).digest("base64url");
}
function cookieValue(request: Request): string | null {
  const cookies = request.headers.get("cookie") || "";
  for (const entry of cookies.split(";")) {
    const [name, ...rest] = entry.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return null;
}
export function authConfigured(): boolean {
  return Boolean(process.env.CIVICWATCH_ACCESS_KEY && process.env.CIVICWATCH_SESSION_SECRET && process.env.CIVICWATCH_SESSION_SECRET.length >= 32);
}
export function verifyAccessKey(candidate: string): boolean {
  const expected = process.env.CIVICWATCH_ACCESS_KEY || "";
  return Boolean(expected) && safeEqual(candidate, expected);
}
export function createSessionCookie(): string {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const value = expiresAt + "." + signature(expiresAt);
  return COOKIE_NAME + "=" + encodeURIComponent(value) + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=" + SESSION_SECONDS;
}
export function clearSessionCookie(): string {
  return COOKIE_NAME + "=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
}
export function isAuthenticated(request: Request): boolean {
  if (!authConfigured()) return false;
  const value = cookieValue(request);
  if (!value) return false;
  const [rawExpiry, suppliedSignature] = value.split(".");
  const expiresAt = Number(rawExpiry);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000) || !suppliedSignature) return false;
  try { return safeEqual(suppliedSignature, signature(expiresAt)); } catch { return false; }
}
export function unauthorized(): Response {
  return Response.json({ error: "Sign in to CivicWatch first." }, { status: 401 });
}
export function requireAuth(request: Request): Response | null {
  return isAuthenticated(request) ? null : unauthorized();
}
export function requireInternal(request: Request): Response | null {
  const secret = process.env.CIVICWATCH_INTERNAL_SECRET;
  if (!secret || !safeEqual(request.headers.get("authorization") || "", "Bearer " + secret)) {
    return Response.json({ error: "Invalid internal callback credentials." }, { status: 401 });
  }
  return null;
}
