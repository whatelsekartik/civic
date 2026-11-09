import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowUpRight, CheckCircle2,
  ChevronRight, Clapperboard, CloudUpload, FileVideo2,
  FolderOpen, HardDrive, LayoutDashboard, LoaderCircle, MapPin, Pause,
  Play, Plus, RefreshCw, ShieldCheck, Trash2, Upload, Wifi, X, KeyRound, LogOut
} from "lucide-react";
import { api, type Incident, type IncidentStatus, type Job, type SystemInfo, type Zone } from "./api";

type Page = "Overview" | "Analyse video" | "Incidents" | "Zones" | "System";
const navigation: { label: Page; icon: typeof LayoutDashboard }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Analyse video", icon: Clapperboard },
  { label: "Incidents", icon: AlertCircle },
  { label: "Zones", icon: MapPin },
  { label: "System", icon: HardDrive },
];

function formatDate(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export default function App() {
  const [page, setPage] = useState<Page>("Overview");
  const [online, setOnline] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authConfigured, setAuthConfigured] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [accessKey, setAccessKey] = useState("");
  const [authError, setAuthError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [connectionError, setConnectionError] = useState("");
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [points, setPoints] = useState<number[][]>([]);
  const [zoneName, setZoneName] = useState("No-parking zone");
  const [zoneType, setZoneType] = useState("no_parking");
  const [dwell, setDwell] = useState(20);
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>([]);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [filter, setFilter] = useState<"All" | IncidentStatus>("All");
  const [search, setSearch] = useState("");
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api.auth().then((state) => {
      setAuthConfigured(state.configured);
      setAuthenticated(state.authenticated);
      setAuthReady(true);
    }).catch((error) => {
      setAuthError(errorMessage(error));
      setAuthReady(true);
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [health, systemInfo, incidentRows, zoneRows, jobRows] = await Promise.all([
        api.health(), api.system(), api.incidents(), api.zones(), api.jobs()
      ]);
      setOnline(health.ok);
      setConnectionError("");
      setSystem(systemInfo);
      setIncidents(incidentRows);
      setZones(zoneRows);
      setJobs(jobRows);
    } catch (error) {
      setOnline(false);
      setConnectionError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh, authenticated]);

  const activeJobId = activeJob?.id;
  const activeJobStatus = activeJob?.status;
  useEffect(() => {
    if (!authenticated || !activeJobId || activeJobStatus === "completed" || activeJobStatus === "failed") return;
    const timer = window.setInterval(async () => {
      try {
        const latest = await api.job(activeJobId);
        setActiveJob(latest);
        setJobs((items) => [latest, ...items.filter((item) => item.id !== latest.id)]);
        if (latest.status === "completed") {
          await refresh();
          setNotice("Video analysis complete. Your annotated video and incident candidates are ready.");
        } else if (latest.status === "failed") {
          setNotice("Analysis failed: " + latest.message);
        }
      } catch (error) {
        setNotice("Could not read analysis progress: " + errorMessage(error));
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [activeJobId, activeJobStatus, refresh, authenticated]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      setVideoSize({ width: 0, height: 0 });
      setPoints([]);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setVideoSize({ width: 0, height: 0 });
    setPoints([]);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const filteredIncidents = useMemo(() => incidents.filter((incident) => {
    const matchesStatus = filter === "All" || incident.status === filter;
    const query = search.trim().toLowerCase();
    const haystack = [incident.id, incident.title, incident.category, incident.location, incident.camera].join(" ").toLowerCase();
    return matchesStatus && haystack.includes(query);
  }), [incidents, filter, search]);

  const pending = incidents.filter((item) => item.status === "Pending review").length;
  const forwarded = incidents.filter((item) => item.status === "Forwarded").length;
  const resolved = incidents.filter((item) => item.status === "Resolved").length;

  function chooseFile(next: File | null) {
    if (!next) return;
    if (!next.type.startsWith("video/") && !/\.(mp4|mov|avi|mkv|m4v)$/i.test(next.name)) {
      setNotice("Choose an MP4, MOV, AVI, MKV or M4V video.");
      return;
    }
    if (next.size > 500 * 1024 * 1024) {
      setNotice("This file exceeds the 500 MB cloud upload limit.");
      return;
    }
    setFile(next);
    setActiveJob(null);
    setNotice("");
  }

  function addZonePoint(event: MouseEvent<SVGSVGElement>) {
    if (!videoSize.width || !videoSize.height) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(videoSize.width, ((event.clientX - rect.left) / rect.width) * videoSize.width));
    const y = Math.max(0, Math.min(videoSize.height, ((event.clientY - rect.top) / rect.height) * videoSize.height));
    setPoints((items) => [...items, [Math.round(x), Math.round(y)]]);
  }

  async function saveZone() {
    if (!videoSize.width || points.length < 3) {
      setNotice("Add at least three points on the video to outline a zone.");
      return;
    }
    try {
      const normalized = points.map((point) => [
        Math.round((point[0] / videoSize.width) * 1000),
        Math.round((point[1] / videoSize.height) * 1000),
      ]);
      const saved = await api.saveZone({
        name: zoneName.trim() || "Unnamed zone",
        zone_type: zoneType,
        camera_id: "uploaded-video",
        points: normalized,
        dwell_seconds: dwell,
      });
      setZones((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      if (saved.id) setSelectedZoneIds((items) => items.includes(saved.id!) ? items : [...items, saved.id!]);
      setPoints([]);
      setNotice("Zone saved. Select it when analysing footage from the same camera and angle.");
    } catch (error) {
      setNotice("Could not save the zone: " + errorMessage(error));
    }
  }

  async function analyseVideo() {
    if (!file) {
      setNotice("Choose a video first.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const job = await api.analyse(file, selectedZoneIds, setUploadProgress);
      setActiveJob(job);
      setJobs((items) => [job, ...items.filter((item) => item.id !== job.id)]);
      setNotice("Video uploaded to private Vercel Blob. Cloud analysis has been queued.");
      setUploadProgress(100);
    } catch (error) {
      setNotice("Cloud upload failed: " + errorMessage(error));
    } finally {
      setBusy(false);
      setUploadProgress(0);
    }
  }

  async function changeIncidentStatus(incident: Incident, status: IncidentStatus) {
    try {
      await api.updateIncident(incident.id, status, incident.note);
      setIncidents((items) => items.map((item) => item.id === incident.id ? { ...item, status } : item));
      setSelectedIncident((current) => current?.id === incident.id ? { ...current, status } : current);
      setNotice(incident.id + " marked " + status.toLowerCase() + ".");
    } catch (error) {
      setNotice("Status update failed: " + errorMessage(error));
    }
  }

  async function deleteZone(zone: Zone) {
    if (!zone.id) return;
    try {
      await api.deleteZone(zone.id);
      setZones((items) => items.filter((item) => item.id !== zone.id));
      setSelectedZoneIds((items) => items.filter((id) => id !== zone.id));
      setNotice("Zone deleted.");
    } catch (error) {
      setNotice("Could not delete zone: " + errorMessage(error));
    }
  }

  function exportCsv() {
    const headers = ["ID", "Title", "Category", "Location", "Camera", "Detected at", "Confidence", "Status", "Note"];
    const rows = incidents.map((item) => [item.id, item.title, item.category, item.location, item.camera, item.detected_at, item.confidence, item.status, item.note]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => '"' + String(cell ?? "").replace(/"/g, '""') + '"').join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "civicwatch-incidents.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function togglePreview() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }

  const statusTone = online ? "good" : "bad";

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginBusy(true);
    setAuthError("");
    try {
      await api.login(accessKey);
      setAuthenticated(true);
      setAccessKey("");
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleLogout() {
    try { await api.logout(); } catch (error) { setAuthError(errorMessage(error)); }
    setAuthenticated(false);
    setIncidents([]);
    setJobs([]);
    setZones([]);
  }

  if (!authReady) return <AccessScreen mode="loading" />;
  if (!authConfigured) return <AccessScreen mode="setup" error={authError} />;
  if (!authenticated) return <AccessScreen mode="login" accessKey={accessKey} setAccessKey={setAccessKey} onSubmit={handleLogin} busy={loginBusy} error={authError} />;

  return (
    <div className="cw-shell">
      <aside className="cw-sidebar">
        <div className="cw-brand">
          <div className="cw-brand-mark"><ShieldCheck size={22} /></div>
          <div><strong>civicwatch</strong><span>INTELLIGENCE STUDIO</span></div>
        </div>
        <div className="cw-workspace"><span className="cw-label">WORKSPACE</span><b>Cloud pilot</b><small>Runs on Vercel</small></div>
        <span className="cw-label cw-nav-label">OPERATIONS</span>
        <nav className="cw-nav">
          {navigation.map((item) => {
            const Icon = item.icon;
            return <button key={item.label} className={page === item.label ? "cw-nav-item active" : "cw-nav-item"} onClick={() => setPage(item.label)}>
              <Icon size={17} /><span>{item.label}</span>{item.label === "Incidents" && incidents.length > 0 && <em>{incidents.length}</em>}
            </button>;
          })}
        </nav>
        <div className="cw-sidebar-bottom">
          <div className="cw-privacy"><ShieldCheck size={16} /><div><b>Private cloud processing</b><p>Footage is stored in a private Blob store.</p></div></div>
          <div className="cw-version">CIVICWATCH · VERCEL CLOUD MVP</div>
        </div>
      </aside>

      <main className="cw-main">
        <header className="cw-topbar">
          <div><span>Workspace</span><ChevronRight size={13} /><b>{page}</b></div>
          <div className={"cw-connection " + statusTone}><i />{online ? "VERCEL API CONNECTED" : "VERCEL API OFFLINE"}</div><button className="cw-logout" onClick={() => void handleLogout()}><LogOut size={14} /> Sign out</button>
        </header>

        <div className="cw-content">
          {!online && <div className="cw-offline"><Wifi size={18} /><div><b>Cloud services are not reachable.</b><p>{connectionError || "Check your Vercel deployment and configured storage/queue services."}</p></div><button onClick={() => void refresh()}><RefreshCw size={14} /> Retry</button></div>}
          {notice && <div className="cw-toast"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}

          {page === "Overview" && <>
            <div className="cw-heading"><div><span className="cw-eyebrow">CIVIC MONITORING WORKSPACE</span><h1>Good to see you<span>.</span></h1><p>Upload recorded road footage, inspect candidate incidents and track human review.</p></div><button className="cw-primary" onClick={() => setPage("Analyse video")}><CloudUpload size={16} /> Upload a video</button></div>
            <div className="cw-stats">
              <div><span>Incident candidates</span><b>{incidents.length}</b><small>From analysed footage</small></div>
              <div><span>Pending review</span><b>{pending}</b><small>Needs human verification</small></div>
              <div><span>Forwarded</span><b>{forwarded}</b><small>Awaiting department action</small></div>
              <div><span>Resolved</span><b>{resolved}</b><small>Closure recorded</small></div>
            </div>
            <div className="cw-home-grid">
              <section className="cw-panel cw-start-panel">
                <span className="cw-eyebrow">START HERE</span>
                <h2>Analyse your first video.</h2>
                <p>Pick a road CCTV recording, draw the monitoring area, then run object detection and tracking in an isolated Vercel Sandbox.</p>
                <button className="cw-primary" onClick={() => setPage("Analyse video")}><Upload size={16} /> Open video analysis</button>
                <div className="cw-checks"><span><CheckCircle2 size={15} /> MP4 / MOV / AVI support</span><span><CheckCircle2 size={15} /> YOLO object detection</span><span><CheckCircle2 size={15} /> ByteTrack tracking</span><span><CheckCircle2 size={15} /> Human-reviewed incidents</span></div>
              </section>
              <section className="cw-panel">
                <div className="cw-panel-title"><div><h2>Local AI engine</h2><p>Runtime status from Vercel</p></div><span className={"cw-pill " + (online ? "good" : "bad")}>{online ? "Connected" : "Offline"}</span></div>
                <div className="cw-system-row"><span>API service</span><b>{online ? "Running" : "Not running"}</b></div>
                <div className="cw-system-row"><span>Compute</span><b>{system?.compute || "—"}</b></div>
                <div className="cw-system-row"><span>Vehicle model</span><b>{system?.models?.detector || "—"}</b></div>
                <div className="cw-system-row"><span>Zones saved</span><b>{zones.length}</b></div>
                <button className="cw-link" onClick={() => setPage("System")}>View system details <ArrowUpRight size={14} /></button>
              </section>
            </div>
            <section className="cw-panel">
              <div className="cw-panel-title"><div><h2>Recent analysis jobs</h2><p>Uploaded videos and processing status</p></div><button className="cw-link" onClick={() => setPage("Analyse video")}>Analyse another <ArrowUpRight size={14} /></button></div>
              <JobList jobs={jobs.slice(0, 5)} />
            </section>
            <div className="cw-footnote"><ShieldCheck size={15} /> CivicWatch identifies potential issues, not proven offences. An operator must verify each candidate before any report is forwarded.</div>
          </>}

          {page === "Analyse video" && <>
            <div className="cw-heading"><div><span className="cw-eyebrow">UPLOAD · DEFINE ZONES · ANALYSE</span><h1>Video analysis<span>.</span></h1><p>Upload a CCTV recording to private Vercel Blob, then analyse it in a cloud Sandbox.</p></div></div>
            <div className="cw-analysis-grid">
              <section className="cw-panel">
                <div className="cw-panel-title"><div><h2>1. Choose a video</h2><p>MP4, MOV, AVI, MKV or M4V · Maximum 500 MB</p></div><FileVideo2 size={20} /></div>
                <div className="cw-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0] || null); }}>
                  <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,.m4v" onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
                  <div className="cw-drop-icon"><CloudUpload size={25} /></div>
                  <b>{file ? file.name : "Drop a video file here"}</b>
                  <span>{file ? (file.size / (1024 * 1024)).toFixed(1) + " MB · Ready to upload to private cloud storage" : "or browse your device to select a recording"}</span>
                  <button className="cw-secondary" onClick={() => fileInputRef.current?.click()}><FolderOpen size={15} /> Browse files</button>
                </div>
                {previewUrl && <div className="cw-preview-wrap">
                  <div className="cw-preview-head"><b>Video preview</b><span>{videoSize.width ? videoSize.width + " × " + videoSize.height : "Loading video…"}</span></div>
                  <div className="cw-video-stage">
                    <video ref={videoRef} src={previewUrl} muted playsInline onLoadedMetadata={(event) => { const video = event.currentTarget; setVideoSize({ width: video.videoWidth, height: video.videoHeight }); video.currentTime = Math.min(1, video.duration || 1); }} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
                    {videoSize.width > 0 && <svg viewBox={"0 0 " + videoSize.width + " " + videoSize.height} preserveAspectRatio="none" onClick={addZonePoint}>
                      {points.length >= 3 && <polygon points={points.map((point) => point[0] + "," + point[1]).join(" ")} />}
                      {points.map((point, index) => <circle key={index} cx={point[0]} cy={point[1]} r={Math.max(5, videoSize.width / 150)} />)}
                    </svg>}
                    <div className="cw-video-controls"><button onClick={togglePreview}>{isPlaying ? <Pause size={14} /> : <Play size={14} />}{isPlaying ? "Pause" : "Play"}</button><span>Click the video to add polygon points</span></div>
                  </div>
                  <div className="cw-draw-toolbar"><span>{points.length} points drawn</span><button onClick={() => setPoints((items) => items.slice(0, -1))} disabled={!points.length}>Undo point</button><button onClick={() => setPoints([])} disabled={!points.length}>Clear</button></div>
                </div>}
              </section>

              <section className="cw-panel">
                <div className="cw-panel-title"><div><h2>2. Define a monitoring zone</h2><p>Click at least three points on the video preview.</p></div><MapPin size={19} /></div>
                <label className="cw-field">Zone name<input value={zoneName} onChange={(event) => setZoneName(event.target.value)} placeholder="e.g. No-parking lane" /></label>
                <label className="cw-field">Zone type<select value={zoneType} onChange={(event) => setZoneType(event.target.value)}><option value="no_parking">No-parking area</option><option value="footpath">Footpath / pedestrian area</option><option value="road_obstruction">Road obstruction area</option><option value="restricted">Restricted area</option></select></label>
                <label className="cw-field">Stillness threshold<select value={dwell} onChange={(event) => setDwell(Number(event.target.value))}><option value={5}>5 seconds · quick test</option><option value={10}>10 seconds</option><option value={20}>20 seconds</option><option value={30}>30 seconds</option><option value={60}>60 seconds</option></select></label>
                <button className="cw-primary cw-wide" onClick={() => void saveZone()} disabled={!online || points.length < 3}><Plus size={15} /> Save drawn zone</button>
                <div className="cw-rule-note"><AlertCircle size={15} /><p>The stillness check is a pixel-based heuristic, not calibrated speed measurement. Configure zones for the same fixed camera angle and verify every result.</p></div>
                <div className="cw-divider" />
                <div className="cw-panel-title"><div><h2>3. Select zones for this video</h2><p>{selectedZoneIds.length} selected</p></div></div>
                {zones.length === 0 ? <p className="cw-empty-small">No saved zones yet. Draw and save one above. You can still run object detection without a zone, but it will not create zone-based incident candidates.</p> :
                  <div className="cw-zone-select">{zones.map((zone) => <label key={zone.id} className="cw-zone-choice"><input type="checkbox" checked={!!zone.id && selectedZoneIds.includes(zone.id)} onChange={(event) => setSelectedZoneIds((items) => event.target.checked ? [...items, zone.id || ""].filter(Boolean) : items.filter((id) => id !== zone.id))} /><span><b>{zone.name}</b><small>{zone.zone_type.replaceAll("_", " ")} · {zone.dwell_seconds}s · {zone.points.length} points</small></span></label>)}</div>}
                <button className="cw-primary cw-wide" onClick={() => void analyseVideo()} disabled={!online || !file || busy || (activeJob !== null && activeJob.status !== "completed" && activeJob.status !== "failed")}>
                  {busy ? <LoaderCircle className="cw-spin" size={16} /> : <Activity size={16} />}{busy ? "Uploading " + uploadProgress + "%…" : "Upload & analyse in Vercel"}
                </button>
                <p className="cw-hint">The browser uploads directly to private Vercel Blob. A Vercel Queue starts a Python 3.13 Sandbox for inference.</p>
              </section>
            </div>
            {activeJob && <section className="cw-panel cw-progress-panel">
              <div className="cw-panel-title"><div><h2>Analysis progress</h2><p>{activeJob.filename}</p></div><span className={"cw-pill " + (activeJob.status === "completed" ? "good" : activeJob.status === "failed" ? "bad" : "working")}>{activeJob.status}</span></div>
              <div className="cw-progress-track"><span style={{ width: Math.max(0, Math.min(100, activeJob.progress || 0)) + "%" }} /></div>
              <div className="cw-progress-meta"><b>{Math.round(activeJob.progress || 0)}%</b><span>{activeJob.message}</span></div>
              {activeJob.status === "completed" && <div className="cw-result-actions"><a className="cw-secondary" href={api.jobVideoUrl(activeJob.id)} target="_blank" rel="noreferrer"><ArrowDownToLine size={15} /> Download annotated video</a><button className="cw-secondary" onClick={() => setPage("Incidents")}>Review incidents <ArrowUpRight size={14} /></button></div>}
            </section>}
          </>}

          {page === "Incidents" && <>
            <div className="cw-heading"><div><span className="cw-eyebrow">REVIEW & FOLLOW-THROUGH</span><h1>Incident desk<span>.</span></h1><p>Only incidents generated by the local analysis engine appear here.</p></div><button className="cw-secondary" onClick={exportCsv} disabled={!incidents.length}><ArrowDownToLine size={15} /> Export CSV</button></div>
            <div className="cw-filters"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search incidents, zones or source video…" /><select value={filter} onChange={(event) => setFilter(event.target.value as "All" | IncidentStatus)}>{["All", "Pending review", "Verified", "Forwarded", "Resolved", "Dismissed"].map((value) => <option key={value}>{value}</option>)}</select><button className="cw-secondary" onClick={() => { setSearch(""); setFilter("All"); }}><RefreshCw size={14} /> Reset</button></div>
            {filteredIncidents.length === 0 ? <EmptyState title="No incident candidates yet" text="Upload a road recording, draw a zone and run analysis. Potential incidents will appear here for human review." action={() => setPage("Analyse video")} /> :
              <div className="cw-incident-list">{filteredIncidents.map((incident) => <article className="cw-incident" key={incident.id}>
                <button className="cw-incident-main" onClick={() => setSelectedIncident(incident)}><span className="cw-incident-id">{incident.id}</span><b>{incident.title}</b><small>{incident.category} · {incident.location || "Uploaded video"} · {formatDate(incident.detected_at)}</small></button>
                <div className="cw-incident-confidence"><b>{Math.round(incident.confidence)}%</b><small>confidence</small></div>
                <select aria-label={"Update status for " + incident.id} value={incident.status} onChange={(event) => void changeIncidentStatus(incident, event.target.value as IncidentStatus)}>{["Pending review", "Verified", "Forwarded", "Resolved", "Dismissed"].map((value) => <option key={value}>{value}</option>)}</select>
                <button className="cw-icon-button" onClick={() => setSelectedIncident(incident)} aria-label="View incident"><ChevronRight size={17} /></button>
              </article>)}</div>}
          </>}

          {page === "Zones" && <>
            <div className="cw-heading"><div><span className="cw-eyebrow">CAMERA GEOMETRY</span><h1>Monitoring zones<span>.</span></h1><p>Saved polygon regions are reused for recordings from the same camera view.</p></div><button className="cw-primary" onClick={() => setPage("Analyse video")}><Plus size={15} /> Draw a zone</button></div>
            {zones.length === 0 ? <EmptyState title="No zones configured" text="Open video analysis, choose a reference recording and click points around the area you want to monitor." action={() => setPage("Analyse video")} /> :
              <div className="cw-zone-list">{zones.map((zone) => <article className="cw-zone-card" key={zone.id}><div className="cw-zone-icon"><MapPin size={18} /></div><div><b>{zone.name}</b><p>{zone.zone_type.replaceAll("_", " ")} · {zone.dwell_seconds} second threshold · {zone.points.length} polygon points</p><small>Camera view: {zone.camera_id || "Not specified"}</small></div><button className="cw-icon-button danger" onClick={() => void deleteZone(zone)} aria-label={"Delete " + zone.name}><Trash2 size={16} /></button></article>)}</div>}
            <div className="cw-rule-note"><AlertCircle size={15} /><p>Important: polygon coordinates are normalised to the source video dimensions. Use a saved zone only for the same fixed camera position, framing and orientation.</p></div>
          </>}

          {page === "System" && <>
            <div className="cw-heading"><div><span className="cw-eyebrow">VERCEL RUNTIME</span><h1>System status<span>.</span></h1><p>Diagnostics for cloud storage, queues and isolated inference.</p></div><button className="cw-secondary" onClick={() => void refresh()}><RefreshCw size={14} /> Refresh</button></div>
            <section className="cw-panel">
              <div className="cw-panel-title"><div><h2>Cloud services</h2><p>Vercel Functions · Blob · Queues · Sandbox</p></div><span className={"cw-pill " + (online ? "good" : "bad")}>{online ? "Online" : "Offline"}</span></div>
              <div className="cw-system-row"><span>API</span><b>{online ? "Healthy" : connectionError || "Not reachable"}</b></div>
              <div className="cw-system-row"><span>Storage</span><b>{system?.storage || "Not configured"}</b></div>
              <div className="cw-system-row"><span>Compute</span><b>{system?.compute || "Unknown"}</b></div>
              <div className="cw-system-row"><span>Queue</span><b>{system?.queue || "Unknown"}</b></div>
              <div className="cw-system-row"><span>Sandbox vCPU</span><b>{system?.sandboxVcpus || "Unknown"}</b></div>
              <div className="cw-system-row"><span>Sandbox time limit</span><b>{system?.sandboxTimeoutMs ? Math.round(system.sandboxTimeoutMs / 60000) + " minutes" : "Unknown"}</b></div>
              <div className="cw-system-row"><span>Pothole model</span><b>{system?.models?.specialised_models?.pothole || "Not installed"}</b></div>
              <div className="cw-system-row"><span>Waste model</span><b>{system?.models?.specialised_models?.waste || "Not installed"}</b></div>
            </section>
            <div className="cw-rule-note"><ShieldCheck size={16} /><p>Uploaded footage is kept in a private Vercel Blob store. Use a strong shared access key and only upload recordings you are authorised to process. Face recognition and automatic challans are not part of this MVP.</p></div>
          </>}
        </div>
        <footer className="cw-footer"><span>CIVICWATCH · VERCEL-NATIVE CLOUD MONITORING</span><span>Human verification required <i /> {online ? "Cloud ready" : "Cloud offline"}</span></footer>
      </main>

      {selectedIncident && <div className="cw-modal-backdrop" onClick={() => setSelectedIncident(null)}><section className="cw-modal" onClick={(event) => event.stopPropagation()}>
        <div className="cw-modal-head"><div><span className="cw-eyebrow">{selectedIncident.id}</span><h2>{selectedIncident.title}</h2></div><button className="cw-icon-button" onClick={() => setSelectedIncident(null)}><X size={18} /></button></div>
        <p className="cw-modal-category">{selectedIncident.category}</p>
        <div className="cw-system-row"><span>Detected</span><b>{formatDate(selectedIncident.detected_at)}</b></div>
        <div className="cw-system-row"><span>Source</span><b>{selectedIncident.camera}</b></div>
        <div className="cw-system-row"><span>Zone</span><b>{selectedIncident.location || "Not specified"}</b></div>
        <div className="cw-system-row"><span>Model confidence</span><b>{Math.round(selectedIncident.confidence)}%</b></div>
        <div className="cw-modal-note"><b>Evidence note</b><p>{selectedIncident.note}</p></div>
        <label className="cw-field">Review status<select value={selectedIncident.status} onChange={(event) => void changeIncidentStatus(selectedIncident, event.target.value as IncidentStatus)}>{["Pending review", "Verified", "Forwarded", "Resolved", "Dismissed"].map((value) => <option key={value}>{value}</option>)}</select></label>
        {selectedIncident.source_job && <a className="cw-secondary cw-wide" href={api.jobVideoUrl(selectedIncident.source_job)} target="_blank" rel="noreferrer"><ArrowDownToLine size={15} /> Open annotated source video</a>}
        <p className="cw-modal-disclaimer"><ShieldCheck size={14} /> This is an AI-generated candidate, not a legally established offence.</p>
      </section></div>}
    </div>
  );
}


function AccessScreen(props: {
  mode: "loading" | "setup" | "login";
  accessKey?: string;
  setAccessKey?: (value: string) => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  busy?: boolean;
  error?: string;
}) {
  return <div className="cw-auth-shell">
    <section className="cw-auth-card">
      <div className="cw-brand-mark"><ShieldCheck size={24} /></div>
      <span className="cw-eyebrow">CIVIC MONITORING WORKSPACE</span>
      <h1>civicwatch<span>.</span></h1>
      {props.mode === "loading" ? <>
        <p>Connecting securely to your Vercel workspace…</p>
      </> : props.mode === "setup" ? <>
        <h2>Cloud access is not configured.</h2>
        <p>Add the required environment variables to your Vercel project before using CivicWatch.</p>
        <div className="cw-auth-code">CIVICWATCH_ACCESS_KEY<br />CIVICWATCH_SESSION_SECRET<br />CIVICWATCH_INTERNAL_SECRET</div>
        <p className="cw-auth-error">{props.error || "Private Blob storage and Vercel Queues must also be connected."}</p>
      </> : <>
        <h2>Sign in to continue.</h2>
        <p>Enter the private access key configured by the CivicWatch administrator.</p>
        <form onSubmit={props.onSubmit}>
          <label className="cw-field">Access key<input autoFocus type="password" autoComplete="current-password" value={props.accessKey || ""} onChange={(event) => props.setAccessKey?.(event.target.value)} placeholder="Enter access key" required /></label>
          {props.error && <p className="cw-auth-error">{props.error}</p>}
          <button className="cw-primary cw-wide" type="submit" disabled={props.busy || !props.accessKey}>{props.busy ? "Signing in…" : <><KeyRound size={15} /> Sign in</>}</button>
        </form>
      </>}
      <div className="cw-auth-foot"><ShieldCheck size={14} /> Private workspace · Cloud inference</div>
    </section>
  </div>;
}

function JobList({ jobs }: { jobs: Job[] }) {
  if (!jobs.length) return <p className="cw-empty-small">No videos processed yet. Your analysis history will appear here.</p>;
  return <div className="cw-job-list">{jobs.map((job) => <div className="cw-job-row" key={job.id}>
    <div className="cw-job-icon"><FileVideo2 size={17} /></div><div className="cw-job-copy"><b>{job.filename}</b><small>{job.message || "Waiting to start"}</small></div>
    <span className={"cw-pill " + (job.status === "completed" ? "good" : job.status === "failed" ? "bad" : "working")}>{job.status}</span>
    {job.status === "completed" && <a className="cw-icon-button" href={api.jobVideoUrl(job.id)} target="_blank" rel="noreferrer" aria-label="Download annotated video"><ArrowDownToLine size={16} /></a>}
  </div>)}</div>;
}
function EmptyState({ title, text, action }: { title: string; text: string; action: () => void }) {
  return <div className="cw-empty"><div><FileVideo2 size={24} /></div><h2>{title}</h2><p>{text}</p><button className="cw-primary" onClick={action}><Upload size={15} /> Get started</button></div>;
}
