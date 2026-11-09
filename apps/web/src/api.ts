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
};
export type Job = {
  id: string;
  filename: string;
  status: "queued" | "processing" | "completed" | "failed" | string;
  progress: number;
  message: string;
  created_at?: string;
  completed_at?: string | null;
};
export type SystemInfo = {
  database?: string;
  mode?: string;
  models?: {
    detector?: string;
    weights?: string;
    weights_path?: string;
    device?: string;
    tracking?: string;
    specialised_models?: { pothole?: string; waste?: string };
  };
};
const API = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API + path, init);
  } catch {
    throw new Error("Cannot reach the local API at " + API + ". Start CivicWatch using scripts/start.sh.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(body.detail || "Request failed (" + response.status + ")");
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ ok: boolean; service: string }>("/api/health"),
  system: () => request<SystemInfo>("/api/system"),
  incidents: () => request<Incident[]>("/api/incidents"),
  updateIncident: (id: string, status: IncidentStatus, note = "") =>
    request<{ id: string; status: string }>("/api/incidents/" + encodeURIComponent(id) + "/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note }),
    }),
  zones: () => request<Zone[]>("/api/zones"),
  saveZone: (zone: Zone) => request<Zone>("/api/zones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(zone),
  }),
  deleteZone: (id: string) => request<{ deleted: boolean }>("/api/zones/" + encodeURIComponent(id), { method: "DELETE" }),
  jobs: () => request<Job[]>("/api/jobs"),
  job: (id: string) => request<Job>("/api/jobs/" + encodeURIComponent(id)),
  analyse: (file: File, zoneIds: string[]) => {
    const body = new FormData();
    body.append("file", file);
    body.append("zone_ids", JSON.stringify(zoneIds));
    return request<Job>("/api/jobs/analyse", { method: "POST", body });
  },
  jobVideoUrl: (id: string) => API + "/api/jobs/" + encodeURIComponent(id) + "/video",
};
