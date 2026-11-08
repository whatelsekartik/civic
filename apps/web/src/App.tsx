import { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, Camera,
  CheckCircle2, ChevronDown, CircleHelp, Clock3, Command, Download,
  ExternalLink, FileCheck2, Filter, Gauge, HardDrive, LayoutDashboard,
  MapPin, Menu, MoreHorizontal, Play, Plus, Radio, Search, Settings,
  ShieldCheck, Siren, SlidersHorizontal, Sparkles, Video, Wifi, X
} from "lucide-react";

type Status = "Pending review" | "Verified" | "Forwarded" | "Resolved" | "Dismissed";
type Incident = {
  id: string; title: string; category: string; location: string; camera: string;
  time: string; confidence: number; status: Status; severity: "High" | "Medium" | "Low";
  note: string; color: string;
};

const initialIncidents: Incident[] = [
  { id:"CW-0248", title:"Stationary vehicle in restricted zone", category:"Potential illegal parking", location:"FC Road · Segment 04", camera:"CAM-FC-04", time:"Today, 10:42:18", confidence:94, status:"Pending review", severity:"Medium", note:"Vehicle remained inside the configured no-parking polygon beyond the dwell threshold.", color:"amber" },
  { id:"CW-0247", title:"Roadside obstruction detected", category:"Potential footpath obstruction", location:"JM Road · Segment 02", camera:"CAM-JM-02", time:"Today, 10:31:06", confidence:88, status:"Verified", severity:"High", note:"An object intersects the marked pedestrian zone. Human review is required to determine whether an offence occurred.", color:"rose" },
  { id:"CW-0246", title:"Multiple vehicles stopped near junction", category:"Possible traffic obstruction", location:"Deccan · Junction A", camera:"CAM-DEC-01", time:"Today, 10:15:44", confidence:82, status:"Forwarded", severity:"Medium", note:"Tracked vehicles appear to obstruct the mapped road area.", color:"blue" },
  { id:"CW-0245", title:"Waste accumulation in roadside area", category:"Potential sanitation issue", location:"Model Colony · Segment 01", camera:"MOBILE-SCOUT-01", time:"Today, 09:48:12", confidence:91, status:"Resolved", severity:"Low", note:"Illustrative sample incident; requires a separately installed waste model in real deployments.", color:"green" },
];

const nav = [
  { label:"Overview", icon:LayoutDashboard },
  { label:"Monitoring", icon:Radio },
  { label:"Incident desk", icon:AlertTriangle, count:"4" },
  { label:"Coverage map", icon:MapPin },
  { label:"Reports", icon:FileCheck2 },
];

function App() {
  const [page, setPage] = useState("Overview");
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Incident | null>(null);
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [dark, setDark] = useState(false);
  const [incidents, setIncidents] = useState(initialIncidents);

  const filtered = useMemo(() => incidents.filter(i => {
    const matchesFilter = filter === "All" || i.status === filter;
    const q = query.toLowerCase();
    return matchesFilter && [i.id,i.title,i.category,i.location,i.camera].join(" ").toLowerCase().includes(q);
  }), [incidents, filter, query]);

  const updateStatus = (id:string, status:Status) => {
    setIncidents(items => items.map(i => i.id === id ? {...i,status} : i));
    setSelected(current => current ? {...current,status} : null);
    setNotice(`${id} updated to ${status.toLowerCase()}.`);
  };

  const stats = [
    { label:"Potential incidents", value:incidents.length.toString(), delta:"Across sample data", icon:AlertTriangle, tone:"amber" },
    { label:"Pending review", value:incidents.filter(i=>i.status==="Pending review").length.toString(), delta:"Needs human verification", icon:Clock3, tone:"blue" },
    { label:"Forwarded", value:incidents.filter(i=>i.status==="Forwarded").length.toString(), delta:"Awaiting department action", icon:ArrowUpRight, tone:"violet" },
    { label:"Resolved", value:incidents.filter(i=>i.status==="Resolved").length.toString(), delta:"Closure recorded", icon:CheckCircle2, tone:"green" },
  ];

  return (
    <div className={dark ? "app dark" : "app"}>
      <aside className={mobileNav ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={21}/></div>
          <div><strong>civicwatch</strong><span>INTELLIGENCE STUDIO</span></div>
          <button className="icon-btn mobile-close" onClick={()=>setMobileNav(false)} aria-label="Close navigation"><X size={18}/></button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <button className="workspace-switch"><div className="workspace-avatar">PC</div><span><b>Pilot workspace</b><small>Local environment</small></span><ChevronDown size={15}/></button>
        <div className="nav-label">OPERATIONS</div>
        <nav>
          {nav.map(item => <button key={item.label} className={page===item.label?"nav-item active":"nav-item"} onClick={()=>{setPage(item.label);setMobileNav(false);}}>
            <item.icon size={17}/><span>{item.label}</span>{item.count && <em>{item.count}</em>}
          </button>)}
        </nav>
        <div className="nav-label second">CONFIGURATION</div>
        <nav>
          <button className={page==="AI models"?"nav-item active":"nav-item"} onClick={()=>setPage("AI models")}><Sparkles size={17}/><span>AI models</span></button>
          <button className={page==="Settings"?"nav-item active":"nav-item"} onClick={()=>setPage("Settings")}><Settings size={17}/><span>Settings</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="system-card"><div className="system-top"><span className="live-dot"/><b>Local engine</b><span className="system-status">NOT CONNECTED</span></div><p>Connect the local inference agent to process actual video feeds.</p><button onClick={()=>{setPage("Monitoring");setNotice("Local inference connector is not connected yet.");}}>View connection <ArrowUpRight size={13}/></button></div>
          <div className="profile"><div className="profile-avatar">CW</div><div><b>Workspace operator</b><small>Local administrator</small></div><MoreHorizontal size={18}/></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="top-left"><button className="icon-btn menu-btn" onClick={()=>setMobileNav(true)} aria-label="Open navigation"><Menu size={19}/></button><span className="crumb">Workspace</span><span className="slash">/</span><b>{page}</b></div>
          <div className="top-actions"><div className="env-pill"><span/> DEMO DATA</div><button className="icon-btn" onClick={()=>setNotice("No new notifications.")} aria-label="Notifications"><Bell size={17}/></button><button className="help-btn" onClick={()=>setNotice("CivicWatch is a human-reviewed civic issue monitoring prototype.")}><CircleHelp size={16}/><span>Help</span></button><button className="avatar-small">K</button></div>
        </header>

        <div className="content">
          {notice && <div className="toast"><span>{notice}</span><button onClick={()=>setNotice("")}><X size={15}/></button></div>}
          {page==="Overview" && <>
            <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> MONITORING AT A GLANCE</div><h1>Good morning<span className="heading-period">.</span></h1><p className="subheading">A clear view of what’s happening across your monitored streets.</p></div><button className="button button-dark" onClick={()=>setPage("Monitoring")}><Plus size={16}/> Connect a source</button></div>
            <div className="notice-banner"><div className="notice-icon"><Activity size={18}/></div><div><b>Demo workspace · Local engine disconnected</b><p>Sample incidents below illustrate the workflow. No live cameras or AI processing are active.</p></div><button onClick={()=>setPage("Monitoring")}>Setup monitoring <ArrowUpRight size={14}/></button></div>
            <section className="stats-grid">{stats.map((s,i)=><div className="stat-card" key={s.label}><div className="stat-top"><span>{s.label}</span><span className={`stat-icon ${s.tone}`}><s.icon size={17}/></span></div><div className="stat-value">{s.value}</div><div className="stat-foot">{s.delta}</div></div>)}</section>
            <section className="overview-grid">
              <div className="panel coverage-panel"><div className="panel-heading"><div><h2>Monitoring coverage</h2><p>Connected sources and their current state</p></div><button className="text-link" onClick={()=>setPage("Monitoring")}>Manage sources <ArrowUpRight size={14}/></button></div>
                <div className="map-illustration"><div className="map-grid"/><svg className="map-lines" viewBox="0 0 640 260" preserveAspectRatio="none"><path d="M-20 180 C100 130 105 65 230 88 S390 210 660 65" fill="none" stroke="#b5c8bd" strokeWidth="20"/><path d="M-20 180 C100 130 105 65 230 88 S390 210 660 65" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="7 8"/><path d="M100 -20 C160 70 250 140 320 285 M440 -20 C410 65 390 155 520 280" fill="none" stroke="#c8d4cc" strokeWidth="15"/><path d="M100 -20 C160 70 250 140 320 285 M440 -20 C410 65 390 155 520 280" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="7 8"/></svg><div className="map-label label-one">FC Road</div><div className="map-label label-two">JM Road</div><div className="map-label label-three">Deccan</div><div className="map-pin pin-one"><Camera size={14}/></div><div className="map-pin pin-two"><Camera size={14}/></div><div className="map-pin pin-three"><Camera size={14}/></div><div className="map-legend"><span><i className="dot-green"/>Configured source</span><span><i className="dot-grey"/>Not connected</span></div><div className="map-corner">ILLUSTRATIVE COVERAGE · NOT LIVE</div></div>
                <div className="coverage-foot"><div><span className="coverage-number">0</span><span>Live sources</span></div><div><span className="coverage-number">3</span><span>Sample locations</span></div><div><span className="coverage-number">—</span><span>Coverage uptime</span></div></div>
              </div>
              <div className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Latest incident updates</p></div><button className="icon-btn"><MoreHorizontal size={18}/></button></div><div className="activity-list">{incidents.slice(0,4).map(i=><button className="activity-row" key={i.id} onClick={()=>setSelected(i)}><span className={`activity-dot ${i.color}`}/><span className="activity-copy"><b>{i.title}</b><small>{i.location}</small></span><span className="activity-time">{i.time.split(", ")[1]}</span></button>)}</div><button className="activity-all" onClick={()=>setPage("Incident desk")}>View all incidents <ArrowUpRight size={14}/></button></div>
            </section>
            <section className="panel table-panel"><div className="panel-heading"><div><h2>Incident desk</h2><p>Review, validate and follow through</p></div><button className="text-link" onClick={()=>setPage("Incident desk")}>Open incident desk <ArrowUpRight size={14}/></button></div><IncidentTable items={incidents.slice(0,3)} onSelect={setSelected}/></section>
            <div className="bottom-note"><ShieldCheck size={15}/> CivicWatch flags potential issues. A human must verify every incident before it is forwarded.</div>
          </>}

          {page==="Incident desk" && <>
            <div className="page-heading compact"><div><div className="eyebrow"><span className="eyebrow-line"/> REVIEW & FOLLOW-THROUGH</div><h1>Incident desk<span className="heading-period">.</span></h1><p className="subheading">Review evidence, record decisions and track resolution.</p></div><button className="button button-light" onClick={()=>setNotice("CSV export will be available when the backend is connected.")}><Download size={16}/> Export</button></div>
            <div className="toolbar"><div className="searchbox"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search incidents, locations, cameras…"/></div><div className="filter-wrap"><Filter size={15}/><select value={filter} onChange={e=>setFilter(e.target.value)}>{["All","Pending review","Verified","Forwarded","Resolved","Dismissed"].map(f=><option key={f}>{f}</option>)}</select></div><button className="button button-light small" onClick={()=>{setFilter("All");setQuery("");}}><SlidersHorizontal size={15}/> Reset</button></div>
            <div className="panel table-panel"><div className="table-meta"><span>{filtered.length} incidents</span><span>Sample dataset · Status changes are local to this session</span></div><IncidentTable items={filtered} onSelect={setSelected}/></div>
          </>}

          {page==="Monitoring" && <><div className="page-heading compact"><div><div className="eyebrow"><span className="eyebrow-line"/> CAMERA INFRASTRUCTURE</div><h1>Monitoring sources<span className="heading-period">.</span></h1><p className="subheading">Connect authorised existing CCTV feeds. CivicWatch adds intelligence on top.</p></div><button className="button button-dark" onClick={()=>setNotice("Camera connection requires the local CivicWatch connector. This scaffold does not access camera feeds.")}><Plus size={16}/> Add camera</button></div><div className="notice-banner"><div className="notice-icon"><Wifi size={18}/></div><div><b>Local connector not connected</b><p>RTSP streams must be read by an authorised device on the same network as the cameras.</p></div><span className="connector-badge">OFFLINE</span></div><div className="source-grid"><div className="source-card"><div className="source-card-top"><div className="source-icon"><Camera size={19}/></div><span className="status-chip muted">Not connected</span></div><h3>Existing CCTV / NVR</h3><p>Use authorised municipal camera feeds as the primary monitoring backbone.</p><div className="source-meta"><span>RTSP / NVR</span><span>Local connector required</span></div><button className="button button-light full" onClick={()=>setNotice("Configure the local connector first; no credentials are collected by this demo UI.")}>Configure source <ArrowUpRight size={14}/></button></div><div className="source-card future"><div className="source-card-top"><div className="source-icon robot"><Sparkles size={19}/></div><span className="status-chip future-chip">Future extension</span></div><h3>CivicBot mobile unit</h3><p>A future mobile inspection robot for uncovered footpaths and public spaces.</p><div className="source-meta"><span>Future hardware</span><span>Not in MVP</span></div><button className="button button-light full" disabled>Planned for later</button></div></div><div className="panel info-panel"><h2>How CivicWatch uses existing infrastructure</h2><div className="steps"><div><span>01</span><b>Connect</b><p>Authorised camera/NVR feed is accessed by a local connector.</p></div><div><span>02</span><b>Analyse</b><p>Local AI detects and tracks relevant objects in the feed.</p></div><div><span>03</span><b>Review</b><p>Potential incidents and evidence are sent to the incident desk.</p></div></div></div></>}

          {page==="Coverage map" && <><div className="page-heading compact"><div><div className="eyebrow"><span className="eyebrow-line"/> GEOSPATIAL OVERVIEW</div><h1>Coverage map<span className="heading-period">.</span></h1><p className="subheading">A future view of authorised monitoring locations and issue hotspots.</p></div></div><div className="panel map-full"><div className="map-illustration large"><div className="map-grid"/><svg className="map-lines" viewBox="0 0 900 430" preserveAspectRatio="none"><path d="M-20 280 C150 200 160 90 340 150 S600 340 930 90" fill="none" stroke="#b5c8bd" strokeWidth="30"/><path d="M-20 280 C150 200 160 90 340 150 S600 340 930 90" fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="10 12"/><path d="M180 -30 C240 110 340 220 450 460 M620 -20 C590 100 560 250 700 460" fill="none" stroke="#c8d4cc" strokeWidth="22"/></svg><div className="map-pin pin-one"><Camera size={16}/></div><div className="map-pin pin-two"><Camera size={16}/></div><div className="map-pin pin-three"><Camera size={16}/></div><div className="map-label label-one">FC Road</div><div className="map-label label-two">JM Road</div><div className="map-label label-three">Deccan</div><div className="map-corner">SCHEMATIC ONLY · NO GPS DATA</div></div></div><div className="bottom-note"><MapPin size={15}/> Actual camera locations will appear only after the local connector supplies verified coordinates.</div></>}

          {page==="Reports" && <><div className="page-heading compact"><div><div className="eyebrow"><span className="eyebrow-line"/> DATA & ACCOUNTABILITY</div><h1>Reports<span className="heading-period">.</span></h1><p className="subheading">Export review outcomes and resolution summaries.</p></div><button className="button button-dark" onClick={()=>setNotice("Report export requires the backend integration.")}><Download size={16}/> Export report</button></div><div className="stats-grid">{stats.map(s=><div className="stat-card" key={s.label}><div className="stat-top"><span>{s.label}</span><span className={`stat-icon ${s.tone}`}><s.icon size={17}/></span></div><div className="stat-value">{s.value}</div><div className="stat-foot">{s.delta}</div></div>)}</div><div className="panel info-panel"><h2>Reporting principles</h2><div className="principles"><p><ShieldCheck size={16}/> Every report is a potential issue, not a legally established offence.</p><p><FileCheck2 size={16}/> Human verification is required before forwarding.</p><p><Clock3 size={16}/> Status history should record who acted and when.</p><p><HardDrive size={16}/> Evidence retention must follow the configured policy.</p></div></div></>}

          {page==="AI models" && <><div className="page-heading compact"><div><div className="eyebrow"><span className="eyebrow-line"/> LOCAL INFERENCE</div><h1>AI models<span className="heading-period">.</span></h1><p className="subheading">Model availability is reported by the local inference connector.</p></div></div><div className="model-grid"><ModelCard title="Vehicle & person detection" model="YOLO pretrained weights" state="Connector required" description="Common road objects: cars, motorcycles, buses, trucks and people."/><ModelCard title="Multi-object tracking" model="ByteTrack" state="Connector required" description="Associates object detections across frames to estimate movement and dwell time."/><ModelCard title="Road damage" model="Dedicated pothole weights" state="Not installed" description="Requires a separately trained or licensed road-damage model."/><ModelCard title="Waste detection" model="Dedicated waste weights" state="Not installed" description="Requires a specialised waste detection model; generic COCO weights are insufficient."/><ModelCard title="Scene segmentation" model="Road / footpath zones" state="Planned" description="Supports scene geometry and zone-aware obstruction analysis."/><ModelCard title="Speed measurement" model="Calibrated sensor / geometry" state="Not enabled" description="Speed enforcement requires a calibrated measurement system, not object detection alone." /></div></>}

          {page==="Settings" && <><div className="page-heading compact"><div><div className="eyebrow"><span className="eyebrow-line"/> PREFERENCES & SECURITY</div><h1>Settings<span className="heading-period">.</span></h1><p className="subheading">Local-first defaults and operator preferences.</p></div></div><div className="settings-grid"><div className="panel settings-panel"><h2>Workspace</h2><Setting label="Application mode" value="Demo UI · Local connector absent"/><Setting label="Evidence storage" value="Not configured"/><Setting label="Database" value="Demo data in browser session"/><Setting label="Inference device" value="Reported by local connector"/><Setting label="Data retention" value="Configure before live deployment"/></div><div className="panel settings-panel"><h2>Privacy & safety</h2><div className="setting-row"><div><b>Human verification</b><p>Required before an incident is forwarded.</p></div><span className="toggle on">ON</span></div><div className="setting-row"><div><b>Facial recognition</b><p>Not part of CivicWatch.</p></div><span className="toggle off">OFF</span></div><div className="setting-row"><div><b>Local-first processing</b><p>Video should stay on the authorised local device.</p></div><span className="toggle on">ON</span></div></div></div></>}

          {!["Overview","Incident desk","Monitoring","Coverage map","Reports","AI models","Settings"].includes(page) && <div className="empty-state"><Sparkles size={25}/><h2>{page}</h2><p>This section is part of the CivicWatch roadmap.</p><button className="button button-light" onClick={()=>setPage("Overview")}>Back to overview</button></div>}
        </div>
        <footer className="footer"><span>© 2026 CivicWatch · A civic intelligence prototype</span><span><span className="live-dot"/> Local-first by design <span className="footer-sep">·</span> v0.1.0</span></footer>
      </main>

      {selected && <div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><aside className="drawer"><div className="drawer-head"><div><span className="eyebrow">INCIDENT DETAIL</span><h2>{selected.id}</h2></div><button className="icon-btn" onClick={()=>setSelected(null)}><X size={18}/></button></div><div className="evidence-placeholder"><div className="evidence-overlay"><Camera size={23}/><span>Evidence preview</span><small>Connect local inference to view real footage</small></div><span className="evidence-stamp">SAMPLE RECORD</span></div><span className={`severity ${selected.severity.toLowerCase()}`}>{selected.severity} priority</span><h3 className="drawer-title">{selected.title}</h3><p className="drawer-category">{selected.category}</p><div className="detail-list"><Detail label="Location" value={selected.location}/><Detail label="Camera" value={selected.camera}/><Detail label="Detected" value={selected.time}/><Detail label="Model confidence" value={`${selected.confidence}% · sample value`}/><Detail label="Status" value={selected.status}/></div><div className="drawer-note"><b>Detection notes</b><p>{selected.note}</p></div><div className="drawer-actions"><label>Update status</label><select value={selected.status} onChange={e=>updateStatus(selected.id,e.target.value as Status)}>{["Pending review","Verified","Forwarded","Resolved","Dismissed"].map(s=><option key={s}>{s}</option>)}</select><button className="button button-dark full" onClick={()=>setSelected(null)}>Done</button></div><div className="drawer-disclaimer"><ShieldCheck size={14}/> Potential violation only. Human review required.</div></aside></div>}
    </div>
  );
}

function IncidentTable({items,onSelect}:{items:Incident[];onSelect:(i:Incident)=>void}) {
  return <div className="table-scroll"><table className="incidents-table"><thead><tr><th>INCIDENT</th><th>CATEGORY</th><th>LOCATION</th><th>CONFIDENCE</th><th>STATUS</th><th></th></tr></thead><tbody>{items.map(i=><tr key={i.id} onClick={()=>onSelect(i)}><td><b className="incident-id">{i.id}</b><span className="incident-title">{i.title}</span></td><td>{i.category}</td><td><span className="location-cell"><MapPin size={13}/>{i.location}</span></td><td><span className="confidence">{i.confidence}%</span></td><td><StatusBadge status={i.status}/></td><td><button className="row-arrow" aria-label={`Open ${i.id}`}><ArrowUpRight size={15}/></button></td></tr>)}</tbody></table>{items.length===0&&<div className="no-results">No incidents match this search.</div>}</div>;
}
function StatusBadge({status}:{status:Status}) { const cls=status==="Resolved"?"resolved":status==="Forwarded"?"forwarded":status==="Verified"?"verified":status==="Dismissed"?"dismissed":"pending"; return <span className={`status-badge ${cls}`}><i/>{status}</span>; }
function ModelCard({title,model,state,description}:{title:string;model:string;state:string;description:string}) { const missing=state==="Not installed"||state==="Not enabled"; return <div className="model-card"><div className="model-card-top"><div className="model-icon"><Sparkles size={17}/></div><span className={missing?"status-chip muted":"status-chip amber"}>{state}</span></div><h3>{title}</h3><span className="model-name">{model}</span><p>{description}</p></div>; }
function Setting({label,value}:{label:string;value:string}) {return <div className="setting-row"><div><b>{label}</b></div><span className="setting-value">{value}</span></div>}
function Detail({label,value}:{label:string;value:string}) {return <div className="detail-row"><span>{label}</span><b>{value}</b></div>}

export default App;
