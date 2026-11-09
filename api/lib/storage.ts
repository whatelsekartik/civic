import { del, get, head, issueSignedToken, list, presignUrl, put } from "@vercel/blob";

export function requireBlobStore(): void {
  // Private Blob data operations can use Vercel OIDC, but the client-upload
  // token exchange in @vercel/blob/client currently requires this server secret.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Connect a private Vercel Blob store and add BLOB_READ_WRITE_TOKEN to this project.");
  }
}
export async function saveJson<T>(pathname: string, value: T): Promise<void> {
  requireBlobStore();
  await put(pathname, JSON.stringify(value), {
    access: "private", allowOverwrite: true, contentType: "application/json; charset=utf-8", cacheControlMaxAge: 60,
  });
}
export async function readJson<T>(pathname: string): Promise<T | null> {
  requireBlobStore();
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200) return null;
  return JSON.parse(await new Response(result.stream).text()) as T;
}
export async function listJson<T>(prefix: string): Promise<T[]> {
  requireBlobStore();
  const output: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, limit: 1000, cursor });
    const records = await Promise.all(page.blobs.map((blob) => readJson<T>(blob.pathname)));
    output.push(...records.filter((record): record is T => record !== null));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return output;
}
export async function blobMetadata(pathname: string) {
  requireBlobStore();
  return head(pathname, { access: "private" });
}
export async function deleteBlob(pathname: string): Promise<void> {
  requireBlobStore();
  await del(pathname, { access: "private" });
}
export async function signedBlobUrl(pathname: string, operation: "get" | "put", validForMs: number): Promise<string> {
  requireBlobStore();
  const validUntil = Date.now() + validForMs;
  const token = await issueSignedToken({ pathname, operations: [operation], validUntil });
  const signed = await presignUrl(token, { pathname, operation, validUntil });
  return signed.presignedUrl;
}
export function recordPath(kind: "jobs" | "zones" | "incidents", id: string): string {
  return "civicwatch/" + kind + "/" + id + ".json";
}
export function safeId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}
