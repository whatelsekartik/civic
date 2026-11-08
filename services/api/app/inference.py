from __future__ import annotations

import os
import time
import uuid
from pathlib import Path
from typing import Any

import cv2

try:
    from ultralytics import YOLO
except Exception:
    YOLO = None

MODEL_PATH = Path(os.getenv("CIVICWATCH_VEHICLE_MODEL", "models/yolo26n.pt"))
MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
_model = None

def device_name() -> str:
    try:
        import torch
        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"

def model_status() -> dict[str, Any]:
    return {
        "detector": "available" if YOLO else "dependency_missing",
        "weights": "installed" if MODEL_PATH.exists() else "not_installed",
        "weights_path": str(MODEL_PATH),
        "device": device_name(),
        "tracking": "ByteTrack via Ultralytics",
        "specialised_models": {
            "pothole": "not_installed",
            "waste": "not_installed",
        },
    }

def get_model():
    global _model
    if YOLO is None:
        raise RuntimeError("Ultralytics is not installed. Run the local setup script.")
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Detection weights not found at {MODEL_PATH}. Download weights from the AI Models page or run tools/download_model.py."
        )
    if _model is None:
        _model = YOLO(str(MODEL_PATH))
    return _model

def analyse_video(
    video_path: Path,
    output_dir: Path,
    zones: list[dict[str, Any]] | None = None,
    progress=None,
) -> dict[str, Any]:
    """Track objects and apply basic zone dwell rules to uploaded video.

    Events are candidates only. They require operator verification.
    """
    model = get_model()
    output_dir.mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError("Could not open the uploaded video.")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    output_video = output_dir / f"{video_path.stem}-annotated.mp4"
    writer = cv2.VideoWriter(
        str(output_video), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height)
    )
    if not writer.isOpened():
        cap.release()
        raise RuntimeError("Could not create annotated MP4. Check local video codec support.")

    zone_rules = zones or []
    first_seen: dict[tuple[str, str], float] = {}
    last_seen: dict[tuple[str, str], float] = {}
    emitted: set[tuple[str, str]] = set()
    incident_candidates: list[dict[str, Any]] = []
    class_names = model.names
    vehicle_ids = {2, 3, 5, 7}
    frames_done = 0
    snapshots = output_dir / "snapshots"
    snapshots.mkdir(exist_ok=True)
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            frames_done += 1
            result = model.track(
                frame, persist=True, tracker="bytetrack.yaml",
                device=device_name(), conf=0.35, verbose=False,
            )[0]
            annotated = result.plot()
            timestamp = frames_done / fps
            boxes = result.boxes
            if boxes is not None and boxes.xyxy is not None:
                xyxy = boxes.xyxy.cpu().numpy()
                cls = boxes.cls.cpu().numpy().astype(int)
                conf = boxes.conf.cpu().numpy()
                ids = boxes.id.cpu().numpy().astype(int) if boxes.id is not None else [-1] * len(cls)
                for coords, class_id, confidence, track_id in zip(xyxy, cls, conf, ids):
                    if class_id not in vehicle_ids or track_id < 0:
                        continue
                    label = str(class_names.get(class_id, class_id)).lower()
                    x1, y1, x2, y2 = [int(v) for v in coords]
                    foot = ((x1 + x2) / 2, y2)
                    for zone in zone_rules:
                        points = zone.get("points", [])
                        if len(points) < 3:
                            continue
                        polygon = cv2.convexHull(
                            __import__("numpy").array(points, dtype="int32")
                        )
                        inside = cv2.pointPolygonTest(
                            polygon, (float(foot[0]), float(foot[1])), False
                        ) >= 0
                        key = (str(track_id), str(zone.get("id", zone.get("name", "zone"))))
                        if inside:
                            first_seen.setdefault(key, timestamp)
                            last_seen[key] = timestamp
                            dwell = float(zone.get("dwell_seconds", 20))
                            if timestamp - first_seen[key] >= dwell and key not in emitted:
                                emitted.add(key)
                                incident_candidates.append({
                                    "id": f"CW-{uuid.uuid4().hex[:8].upper()}",
                                    "title": f"Stationary {label} in configured zone",
                                    "category": zone.get("zone_type", "Potential zone obstruction"),
                                    "confidence": float(confidence),
                                    "track_id": str(track_id),
                                    "timestamp_seconds": timestamp,
                                    "zone_name": zone.get("name", "Configured zone"),
                                    "note": "Automated candidate based on object tracking and zone dwell. Operator verification required.",
                                })
                                cv2.imwrite(str(snapshots / f"{key[0]}-{key[1]}.jpg"), annotated)
            writer.write(annotated)
            if progress and (frames_done % max(int(fps), 1) == 0):
                progress(frames_done, total, frames_done / max(fps, 0.1))
    finally:
        cap.release()
        writer.release()
    return {
        "frames_processed": frames_done,
        "total_frames": total,
        "annotated_video": str(output_video),
        "incidents": incident_candidates,
        "device": device_name(),
    }
