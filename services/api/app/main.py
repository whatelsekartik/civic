from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
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
MAX_UPLOAD_BYTES = int(os.getenv("CIVICWATCH_MAX_UPLOAD_BYTES", str(500 * 1024 * 1024)))
ALLOWED_VIDEO_SUFFIXES = {".mp4", ".mov", ".avi", ".mkv", ".m4v"}

app = FastAPI(title="CivicWatch Local API", version="0.2.0")
origins = [
    origin.strip()
    for origin in os.getenv(
        "CIVICWATCH_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()


class ZoneIn(BaseModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=120)
    zone_type: str = "no_parking"
    camera_id: str = ""
    # Normalised 0..1000 video coordinates, independent of preview size.
    points: list[list[int]] = Field(min_length=3)
    dwell_seconds: float = Field(default=20, ge=1, le=600)


class StatusIn(BaseModel):
    status: str
    note: str = ""
    actor: str = "local operator"


def row_dict(row: Any) -> dict[str, Any] | None:
    return dict(row) if row else None


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "civicwatch-local-api",
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/system")
def system() -> dict[str, Any]:
    return {"database": str(DB_PATH), "models": model_status(), "mode": "local-first"}


@app.get("/api/incidents")
def incidents(status: str | None = None) -> list[dict[str, Any]]:
    with connect() as db:
        if status and status != "All":
            rows = db.execute(
                "SELECT * FROM incidents WHERE status=? ORDER BY detected_at DESC",
                (status,),
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM incidents ORDER BY detected_at DESC"
            ).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/incidents/{incident_id}")
def incident_detail(incident_id: str) -> dict[str, Any]:
    with connect() as db:
        row = db.execute(
            "SELECT * FROM incidents WHERE id=?", (incident_id,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "Incident not found")
    return dict(row)


@app.patch("/api/incidents/{incident_id}/status")
def update_incident(incident_id: str, payload: StatusIn) -> dict[str, str]:
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
    audit(
        "incident",
        incident_id,
        "status_changed",
        f"{payload.actor}: {payload.status}; {payload.note}",
    )
    return {"id": incident_id, "status": payload.status}


@app.get("/api/zones")
def list_zones() -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute("SELECT * FROM zones ORDER BY created_at DESC").fetchall()
    zones = []
    for row in rows:
        item = dict(row)
        item["points"] = json.loads(item.pop("points_json"))
        zones.append(item)
    return zones


@app.post("/api/zones")
def save_zone(payload: ZoneIn) -> dict[str, Any]:
    if any(
        len(point) != 2 or any(value < 0 or value > 1000 for value in point)
        for point in payload.points
    ):
        raise HTTPException(400, "Zone points must be x/y pairs between 0 and 1000")
    zone_id = payload.id or f"zone-{uuid.uuid4().hex[:10]}"
    with connect() as db:
        db.execute(
            """INSERT INTO zones(id,name,zone_type,camera_id,points_json,dwell_seconds)
            VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, zone_type=excluded.zone_type, camera_id=excluded.camera_id,
            points_json=excluded.points_json, dwell_seconds=excluded.dwell_seconds""",
            (
                zone_id,
                payload.name,
                payload.zone_type,
                payload.camera_id,
                json.dumps(payload.points),
                payload.dwell_seconds,
            ),
        )
    audit("zone", zone_id, "saved", payload.name)
    return {
        "id": zone_id,
        "name": payload.name,
        "zone_type": payload.zone_type,
        "camera_id": payload.camera_id,
        "points": payload.points,
        "dwell_seconds": payload.dwell_seconds,
    }


@app.delete("/api/zones/{zone_id}")
def delete_zone(zone_id: str) -> dict[str, bool]:
    with connect() as db:
        cur = db.execute("DELETE FROM zones WHERE id=?", (zone_id,))
    if cur.rowcount == 0:
        raise HTTPException(404, "Zone not found")
    audit("zone", zone_id, "deleted")
    return {"deleted": True}


def _process_video_job(job_id: str, target: Path, selected_ids: list[str]) -> None:
    """Run inference after returning the upload response; persist progress for polling."""
    with connect() as db:
        db.execute(
            "UPDATE jobs SET status='processing', progress=0, message=? WHERE id=?",
            ("Loading detector and preparing video…", job_id),
        )

    zones: list[dict[str, Any]] = []
    with connect() as db:
        rows = db.execute("SELECT * FROM zones").fetchall()
    for row in rows:
        item = dict(row)
        if item["id"] not in selected_ids:
            continue
        item["points"] = json.loads(item.pop("points_json"))
        zones.append(item)

    def save_progress(done: int, total: int, elapsed: float) -> None:
        percentage = (done / total * 100) if total > 0 else 0
        with connect() as db:
            db.execute(
                "UPDATE jobs SET progress=?, message=? WHERE id=?",
                (
                    round(percentage, 1),
                    f"Processed {done:,}" + (f" / {total:,} frames" if total else " frames"),
                    job_id,
                ),
            )

    try:
        result = analyse_video(target, OUTPUTS / job_id, zones, progress=save_progress)
        with connect() as db:
            for item in result["incidents"]:
                db.execute(
                    """INSERT OR IGNORE INTO incidents(
                    id,title,category,location,camera,detected_at,confidence,status,severity,
                    note,evidence_path,track_id,source_job
                    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        item["id"],
                        item["title"],
                        item["category"],
                        item.get("zone_name", ""),
                        "Uploaded video",
                        datetime.now(timezone.utc).isoformat(),
                        item["confidence"],
                        "Pending review",
                        "Medium",
                        item["note"],
                        item.get("evidence_path"),
                        item.get("track_id"),
                        job_id,
                    ),
                )
            db.execute(
                """UPDATE jobs SET status='completed', progress=100, message=?,
                completed_at=CURRENT_TIMESTAMP WHERE id=?""",
                (
                    f"{result['frames_processed']:,} frames processed · "
                    f"{len(result['incidents'])} incident candidates",
                    job_id,
                ),
            )
        audit(
            "job",
            job_id,
            "completed",
            f"{result['frames_processed']} frames; {len(result['incidents'])} candidates",
        )
    except Exception as exc:
        message = str(exc).strip() or exc.__class__.__name__
        with connect() as db:
            db.execute(
                "UPDATE jobs SET status='failed', message=? WHERE id=?",
                (message[:500], job_id),
            )
        audit("job", job_id, "failed", message[:500])


@app.post("/api/jobs/analyse", status_code=202)
async def analyse(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    zone_ids: str = Form("[]"),
) -> dict[str, Any]:
    original_name = Path(file.filename or "upload.mp4").name
    suffix = Path(original_name).suffix.lower()
    if suffix not in ALLOWED_VIDEO_SUFFIXES:
        raise HTTPException(415, "Unsupported video. Use MP4, MOV, AVI, MKV or M4V.")

    try:
        selected_ids = json.loads(zone_ids)
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "zone_ids must be a JSON array") from exc
    if not isinstance(selected_ids, list) or any(
        not isinstance(zone_id, str) for zone_id in selected_ids
    ):
        raise HTTPException(400, "zone_ids must be a JSON array of zone IDs")

    job_id = f"job-{uuid.uuid4().hex[:12]}"
    target = UPLOADS / f"{job_id}{suffix}"
    size = 0
    try:
        with target.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        413,
                        f"Video exceeds the local {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit.",
                    )
                output.write(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    if size == 0:
        target.unlink(missing_ok=True)
        raise HTTPException(400, "The uploaded video is empty.")

    with connect() as db:
        db.execute(
            "INSERT INTO jobs(id,filename,status,progress,message) VALUES(?,?,?,?,?)",
            (job_id, original_name, "queued", 0, "Upload received; waiting for local analysis."),
        )
    audit("job", job_id, "uploaded", f"{original_name} · {size} bytes")
    background_tasks.add_task(_process_video_job, job_id, target, selected_ids)
    return {
        "id": job_id,
        "filename": original_name,
        "status": "queued",
        "progress": 0,
        "message": "Upload received; analysis is starting on this Mac.",
    }


@app.get("/api/jobs")
def list_jobs(limit: int = 20) -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute(
            "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?",
            (min(max(limit, 1), 100),),
        ).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    with connect() as db:
        row = db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Job not found")
    return dict(row)


@app.get("/api/jobs/{job_id}/video")
def job_video(job_id: str) -> FileResponse:
    matches = (
        list((OUTPUTS / job_id).glob("*-annotated.mp4"))
        if (OUTPUTS / job_id).exists()
        else []
    )
    if not matches:
        raise HTTPException(404, "Annotated video is not ready.")
    return FileResponse(
        matches[0],
        media_type="video/mp4",
        filename=matches[0].name,
    )


@app.get("/api/audit")
def get_audit(limit: int = 100) -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute(
            "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?",
            (min(max(limit, 1), 500),),
        ).fetchall()
    return [dict(row) for row in rows]
