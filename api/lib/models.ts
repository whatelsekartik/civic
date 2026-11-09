export type IncidentStatus = "Pending review" | "Verified" | "Forwarded" | "Resolved" | "Dismissed";
export type JobStatus = "queued" | "provisioning" | "processing" | "completed" | "failed";
export type Zone = {
  id: string; name: string; zone_type: string; camera_id: string; points: number[][];
  dwell_seconds: number; createdAt: string;
};
export type Incident = {
  id: string; title: string; category: string; location: string; camera: string;
  detected_at: string; confidence: number; status: IncidentStatus; severity: string;
  note: string; source_job: string; track_id?: string; evidence_image_base64?: string;
};
export type Job = {
  id: string; filename: string; sourcePath: string; outputPath: string; zoneIds: string[];
  status: JobStatus; progress: number; message: string; createdAt: string; startedAt?: string;
  completedAt?: string; updatedAt: string; sandboxName?: string; error?: string;
};
export const JOB_PREFIX = "civicwatch/jobs/";
export const ZONE_PREFIX = "civicwatch/zones/";
export const INCIDENT_PREFIX = "civicwatch/incidents/";
