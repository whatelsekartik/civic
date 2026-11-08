export type IncidentStatus = 'Pending review' | 'Verified' | 'Forwarded' | 'Resolved' | 'Dismissed';
export type Incident = {
  id:string; title:string; category:string; location:string; camera:string;
  detected_at:string; confidence:number; status:IncidentStatus; severity:string;
  note:string; evidence_path?:string|null; track_id?:string|null;
};
export type Zone = { id?:string; name:string; zone_type:string; camera_id?:string; points:number[][]; dwell_seconds:number };
const API = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
async function request<T>(path:string, init?:RequestInit):Promise<T>{
  const res = await fetch(`${API}${path}`, init);
  if(!res.ok){ const body = await res.json().catch(()=>({detail:res.statusText})); throw new Error(body.detail ?? `Request failed: ${res.status}`); }
  return res.json() as Promise<T>;
}
export const api = {
  health:()=>request<{ok:boolean;service:string}>('/api/health'),
  system:()=>request<any>('/api/system'),
  incidents:()=>request<Incident[]>('/api/incidents'),
  updateIncident:(id:string,status:IncidentStatus,note='')=>request(`/api/incidents/${encodeURIComponent(id)}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,note})}),
  zones:()=>request<Zone[]>('/api/zones'),
  saveZone:(zone:Zone)=>request<Zone>('/api/zones',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(zone)}),
  analyse:(file:File,zoneIds:string[])=>{const body=new FormData();body.append('file',file);body.append('zone_ids',JSON.stringify(zoneIds));return request<any>('/api/jobs/analyse',{method:'POST',body});}
};
