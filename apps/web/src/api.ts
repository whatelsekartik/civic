import { upload as uploadBlob } from "@vercel/blob/client";

export type IncidentStatus = "Pending review" | "Verified" | "Forwarded" | "Resolved" | "Dismissed";
export type Incident = {
  id: string;
  title: string;
  category: string;
  location: string;
  camera: string;
  detected_at: string;
  confidence: number;
  status: IncidentStatus;
  severity: string;
  note: string;
  evidence_path?: string | null;
  evidence_image_base64?: string;
  track_id?: string | null;
  source_job?: string | null;
};
export type Zone = {
  id?: string;
  name: string;
  zone_type: string;
  camera_id?: string;
  points: number[][];
  dwell_seconds: number;
  createdAt?: string;
};
export type Job = {
  id: string;
  filename: string;
  sourcePath?: string;
  outputPath?: string;
  zoneIds?: string[];
  status: "queued" | "provisioning" | "processing" | "completed" | "failed" | string;
  progress: number;
  message: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  error?: string;
};
export type SystemInfo = {
  platform?: string;
  mode?: string;
  storage?: string;
  queue?: string;
  compute?: string;
  sandboxTimeoutMs?: number;
  sandboxVcpus?: number;
  models?: {
    detector?: string;
    weights?: string;
    weights_path?: string;
    device?: string;
    tracking?: string;
    specialised_models?: { pothole?: string; waste?: string };
  };
};
export type AuthState = { configured: boolean; authenticated: boolean };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "same-origin", ...init });
  } catch {
    throw new Error("Cannot reach CivicWatch on Vercel. Check your connection and retry.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || body.detail || "Request failed (" + response.status + ")");
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ ok: boolean; service: string }>("/api/health"),
  auth: () => request<AuthState>("/api/auth"),
  login: (accessKey: string) =>
    request<{ authenticated: boolean }>("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessKey }),
    }),
  logout: () => request<{ authenticated: boolean }>("/api/auth", { method: "DELETE" }),
  system: () => request<SystemInfo>("/api/system"),
  incidents: () => request<Incident[]>("/api/incidents"),
  updateIncident: (id: string, status: IncidentStatus, note = "") =>
    request<{ id: string; status: string }>("/api/incidents/" + encodeURIComponent(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note }),
    }),
  zones: () => request<Zone[]>("/api/zones"),
  saveZone: (zone: Zone) =>
    request<Zone>("/api/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(zone),
    }),
  deleteZone: (id: string) =>
    request<{ deleted: boolean }>("/api/zones/" + encodeURIComponent(id), { method: "DELETE" }),
  jobs: () => request<Job[]>("/api/jobs"),
  job: (id: string) => request<Job>("/api/jobs/" + encodeURIComponent(id)),
  analyse: async (file: File, zoneIds: string[], onUploadProgress?: (percentage: number) => void) => {
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-140) || "road-footage.mp4";
    const pathname = "civicwatch/uploads/" + crypto.randomUUID() + "-" + cleanName;
    const blob = await uploadBlob(pathname, file, {
      access: "private",
      handleUploadUrl: "/api/blob/upload",
      multipart: true,
      contentType: file.type || "application/octet-stream",
      onUploadProgress: ({ percentage }) => onUploadProgress?.(Math.round(percentage)),
    });
    return request<Job>("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pathname: blob.pathname, filename: file.name, zoneIds }),
    });
  },
  jobVideoUrl: (id: string) => "/api/jobs/" + encodeURIComponent(id) + "/video",
};
