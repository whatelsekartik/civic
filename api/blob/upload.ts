import { handleUpload } from "@vercel/blob/client";
import { isAuthenticated } from "../lib/security";

const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const ALLOWED_EXTENSIONS = /\.(mp4|mov|avi|mkv|m4v)$/i;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid Blob upload request." }, { status: 400 }); }
  try {
    const response = await handleUpload({
      body: body as never,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!isAuthenticated(request)) throw new Error("Sign in before uploading footage.");
        if (!pathname.startsWith("civicwatch/uploads/") || !ALLOWED_EXTENSIONS.test(pathname)) {
          throw new Error("Only MP4, MOV, AVI, MKV and M4V uploads are allowed.");
        }
        return {
          allowedContentTypes: ["video/*", "application/octet-stream"],
          maximumSizeInBytes: MAX_VIDEO_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ purpose: "civicwatch-video-upload" }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.info("CivicWatch private video upload completed:", blob.pathname);
      },
    });
    return Response.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Blob upload token could not be created." }, { status: 400 });
  }
}
