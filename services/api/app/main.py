from __future__ import annotations

import json
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .db import DB_PATH, audit, connect, init_db
from .inference import analyse_video, model_status

ROOT = Path(os.getenv("CIVICWATCH_DATA_DIR", Path.home() / ".civicwatch"))
UPLOADS = ROOT / "uploads"
OUTPUTS = ROOT / "outputs"
UPLOADS.mkdir(parents=True, exist_ok=True)
OUTPUTS.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="CivicWatch API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CIVICWATCH_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)

@app.on_event("startup")
def startup():
    init_db()

class ZoneIn(BaseModel):
    id: str | None = None
    name: str
    zone_type: str = "no_parking"
    camera_id: str = ""
    points: list[list[int]] = Field(min_length=3)
    dwell_seconds: float = 20

class StatusIn(BaseModel):
    status: str
    note: str = ""
    actor: str = "local operator"

def row_dict(row):
    return dict(row) if row else None

@app.get("/api/health")
def health():
    return {"ok": True, "service": "civicwatch-api", "time": datetime.now(timezone.utc).isoformat()}

@app.get("/api/system")
def system():
    return {"database": str(DB_PATH), "models": model_status(), "mode": "local-first"}

@app.get("/api/incidents")
def incidents(status: str | None = None):
    with connect() as db:
        if status and status != "All":
            rows = db.execute("SELECT * FROM incidents WHERE status=? ORDER BY detected_at DESC", (status,)).fetchall()
        else:
            rows = db.execute("SELECT * FROM incidents ORDER BY detected_at DESC").fetchall()
    return [row_dict(r) for r in rows]

@app.get("/api/incidents/{incident_id}")
def incident_detail(incident_id: str):
    with connect() as db:
        row = db.execute("SELECT * FROM incidents WHERE id=?", (incident_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Incident not found")
    return row_dict(row)

@app.patch("/api/incidents/{incident_id}/status")
def update_incident(incident_id: str, payload: StatusIn):
    allowed = {"Pending review", "Verified", "Forwarded", "Resolved", "Dismissed"}
    if payload.status not in allowed:
        raise HTTPException(400, "Invalid incident status")
    with connect() as db:
        cur = db.execute(
            "UPDATE incidents SET status=?, note=? WHERE id=?",
            (payload.status, payload.note, incident_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Incident not found")
    audit("incident", incident_id, "status_changed", f"{payload.actor}: {payload.status}; {payload.note}")
    return {"id": incident_id, "status": payload.status}

@app.get("/api/zones")
def list_zones():
    with connect() as db:
        rows = db.execute("SELECT * FROM zones ORDER BY created_at DESC").fetchall()
    result = []
    for row in rows:
        item = dict(row)
        item["points"] = json.loads(item.pop("points_json"))
        result.append(item)
    return result

@app.post("/api/zones")
def save_zone(payload: ZoneIn):
    zone_id = payload.id or f"zone-{uuid.uuid4().hex[:10]}"
    with connect() as db:
        db.execute(
            """INSERT INTO zones(id,name,zone_type,camera_id,points_json,dwell_seconds)
            VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, zone_type=excluded.zone_type, camera_id=excluded.camera_id,
            points_json=excluded.points_json, dwell_seconds=excluded.dwell_seconds""",
            (zone_id,payload.name,payload.zone_type,payload.camera_id,json.dumps(payload.points),payload.dwell_seconds),
        )
    audit("zone", zone_id, "saved", payload.name)
    return {"id": zone_id, **payload.model_dump(exclude={"id"})}

@app.delete("/api/zones/{zone_id}")
def delete_zone(zone_id: str):
    with connect() as db:
        cur = db.execute("DELETE FROM zones WHERE id=?", (zone_id,))
    if cur.rowcount == 0:
        raise HTTPException(404, "Zone not found")
    audit("zone", zone_id, "deleted")
    return {"deleted": True}

@app.post("/api/jobs/analyse")
async def analyse(file: UploadFile = File(...), zone_ids: str = Form("[]")):
    suffix = Path(file.filename or "upload.mp4").suffix.lower()
    if suffix not in {".mp4", ".mov", ".avi", ".mkv", ".m4v"}:
        raise HTTPException(415, "Unsupported video format")
    job_id = f"job-{uuid.uuid4().hex[:12]}"
    target = UPLOADS / f"{job_id}{suffix}"
    size = 0
    max_size = int(os.getenv("CIVICWATCH_MAX_UPLOAD_BYTES", str(500 * 1024 * 1024)))
    with target.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > max_size:
                target.unlink(missing_ok=True)
                raise HTTPException(413, "Video exceeds the configured 500 MB local upload limit")
            out.write(chunk)
    try:
        selected_ids = json.loads(zone_ids)
    except json.JSONDecodeError:
        raise HTTPException(400, "zone_ids must be a JSON array")
    with connect() as db:
        db.execute("INSERT INTO jobs(id,filename,status,message) VALUES(?,?,?,?)", (job_id,file.filename or target.name,"processing","Video saved; inference starting"))
    zones = []
    with connect() as db:
        rows = db.execute("SELECT * FROM zones").fetchall()
    for row in rows:
        item = dict(row)
        if selected_ids and item["id"] not in selected_ids:
            continue
        item["points"] = json.loads(item.pop("points_json"))
        zones.append(item)
    try:
        result = analyse_video(target, OUTPUTS / job_id, zones)
        with connect() as db:
            for inc in result["incidents"]:
                detected_at = datetime.now(timezone.utc).isoformat()
                db.execute(
                    """INSERT INTO incidents(id,title,category,location,camera,detected_at,confidence,
                    status,severity,note,track_id,source_job) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (inc["id"],inc["title"],inc["category"],inc.get("zone_name",""),"Uploaded video",
                     detected_at,inc["confidence"],"Pending review","Medium",inc["note"],inc["track_id"],job_id),
                )
            db.execute("UPDATE jobs SET status='completed',progress=100,message=?,completed_at=CURRENT_TIMESTAMP WHERE id=?", (f"{result['frames_processed']} frames processed",job_id))
        audit("job",job_id,"completed",f"{len(result['incidents'])} incident candidates")
        return {"job_id":job_id,**result}
    except Exception as exc:
        with connect() as db:
            db.execute("UPDATE jobs SET status='failed',message=? WHERE id=?", (str(exc)[:500],job_id))
        raise HTTPException(500, f"Video analysis failed: {exc}") from exc

@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    with connect() as db:
        row = db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Job not found")
    return row_dict(row)

@app.get("/api/jobs/{job_id}/video")
def job_video(job_id: str):
    path = OUTPUTS / job_id / f"{job_id}-annotated.mp4"
    matches = list((OUTPUTS / job_id).glob("*-annotated.mp4")) if (OUTPUTS / job_id).exists() else []
    if not matches:
        raise HTTPException(404, "Annotated video not found")
    return FileResponse(matches[0], media_type="video/mp4", filename=matches[0].name)

@app.get("/api/audit")
def get_audit(limit: int = 100):
    with connect() as db:
        rows = db.execute("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?", (min(max(limit,1),500),)).fetchall()
    return [row_dict(r) for r in rows]
