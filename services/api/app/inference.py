from __future__ import annotations

import os
import time
import uuid
from pathlib import Path
from typing import Any, Callable

import cv2
import numpy as np

try:
    from ultralytics import YOLO
except Exception:
    YOLO = None

PROJECT_ROOT = Path(__file__).resolve().parents[3]
MODEL_PATH = Path(os.getenv("CIVICWATCH_VEHICLE_MODEL", str(PROJECT_ROOT / "models" / "yolo11n.pt"))).expanduser()
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
        "weights": "installed" if MODEL_PATH.is_file() else "download_on_first_analysis",
        "weights_path": str(MODEL_PATH),
        "device": device_name(),
        "tracking": "ByteTrack",
        "specialised_models": {
            "pothole": "not_installed",
            "waste": "not_installed",
        },
    }


def get_model():
    global _model
    if YOLO is None:
        raise RuntimeError("Ultralytics is missing. Run scripts/setup-mac.sh first.")
    if _model is None:
        if not MODEL_PATH.is_file():
            raise FileNotFoundError(
                f"Vehicle weights are missing at {MODEL_PATH}. Run scripts/setup-mac.sh to download them."
            )
        _model = YOLO(str(MODEL_PATH))
    return _model


def _zone_contour(zone: dict[str, Any], width: int, height: int) -> np.ndarray | None:
    points = zone.get("points", [])
    if len(points) < 3:
        return None
    scaled = [
        [
            max(0, min(width - 1, round(float(point[0]) * width / 1000))),
            max(0, min(height - 1, round(float(point[1]) * height / 1000))),
        ]
        for point in points
    ]
    return np.asarray(scaled, dtype=np.int32).reshape((-1, 1, 2))


def analyse_video(
    video_path: Path,
    output_dir: Path,
    zones: list[dict[str, Any]] | None = None,
    progress: Callable[[int, int, float], None] | None = None,
) -> dict[str, Any]:
    """Detect and track vehicles in recorded footage; produce review-only candidates."""
    model = get_model()
    output_dir.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError("OpenCV could not open this video. Try exporting it as MP4 (H.264).")

    fps = float(capture.get(cv2.CAP_PROP_FPS) or 25.0)
    if not np.isfinite(fps) or fps < 1:
        fps = 25.0
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if width <= 0 or height <= 0:
        capture.release()
        raise RuntimeError("Video dimensions could not be read.")

    output_video = output_dir / f"{video_path.stem}-annotated.mp4"
    writer = cv2.VideoWriter(
        str(output_video),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height),
    )
    if not writer.isOpened():
        capture.release()
        raise RuntimeError("Could not create the annotated video on this Mac.")

    zone_list = zones or []
    contours: list[tuple[dict[str, Any], np.ndarray]] = []
    for zone in zone_list:
        contour = _zone_contour(zone, width, height)
        if contour is not None:
            contours.append((zone, contour))

    # A short-window pixel displacement heuristic. It is not calibrated speed.
    track_history: dict[str, list[tuple[float, float, float]]] = {}
    stationary_since: dict[tuple[str, str], float] = {}
    last_inside: dict[tuple[str, str], float] = {}
    emitted: set[tuple[str, str]] = set()
    candidates: list[dict[str, Any]] = []
    vehicle_class_ids = {2, 3, 5, 7}
    frames_done = 0
    started = time.monotonic()
    snapshots = output_dir / "snapshots"
    snapshots.mkdir(parents=True, exist_ok=True)

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            frames_done += 1
            result = model.track(
                frame,
                persist=True,
                tracker="bytetrack.yaml",
                device=device_name(),
                conf=0.35,
                imgsz=640,
                verbose=False,
            )[0]
            annotated = result.plot()
            timestamp = frames_done / fps

            for zone, contour in contours:
                cv2.polylines(annotated, [contour], True, (90, 190, 125), 2)

            boxes = result.boxes
            inside_now: set[tuple[str, str]] = set()
            if boxes is not None and boxes.xyxy is not None:
                xyxy = boxes.xyxy.cpu().numpy()
                classes = boxes.cls.cpu().numpy().astype(int)
                confidences = boxes.conf.cpu().numpy()
                if boxes.id is not None:
                    track_ids = boxes.id.cpu().numpy().astype(int)
                else:
                    track_ids = np.full(len(classes), -1, dtype=int)

                for coords, class_id, confidence, track_id in zip(
                    xyxy, classes, confidences, track_ids
                ):
                    if int(class_id) not in vehicle_class_ids or int(track_id) < 0:
                        continue

                    x1, y1, x2, y2 = [int(value) for value in coords]
                    center_x = (x1 + x2) / 2
                    center_y = (y1 + y2) / 2
                    key_id = str(int(track_id))
                    history = track_history.setdefault(key_id, [])
                    history.append((timestamp, center_x, center_y))
                    history[:] = [point for point in history if timestamp - point[0] <= 2.2]
                    stationary = False
                    if len(history) >= 3 and history[-1][0] - history[0][0] >= 1.2:
                        displacement = float(
                            np.hypot(
                                history[-1][1] - history[0][1],
                                history[-1][2] - history[0][2],
                            )
                        )
                        stationary = displacement <= 18.0

                    for zone, contour in contours:
                        foot_point = (float((x1 + x2) / 2), float(y2))
                        inside = cv2.pointPolygonTest(contour, foot_point, False) >= 0
                        zone_id = str(zone.get("id", zone.get("name", "zone")))
                        event_key = (key_id, zone_id)
                        if not inside:
                            continue

                        inside_now.add(event_key)
                        last_inside[event_key] = timestamp
                        if stationary:
                            stationary_since.setdefault(event_key, timestamp - 1.2)
                        else:
                            stationary_since.pop(event_key, None)

                        threshold = float(zone.get("dwell_seconds", 20))
                        if (
                            event_key not in emitted
                            and event_key in stationary_since
                            and timestamp - stationary_since[event_key] >= threshold
                        ):
                            emitted.add(event_key)
                            zone_type = str(zone.get("zone_type", "no_parking"))
                            zone_labels = {
                                "no_parking": "Potential no-parking violation",
                                "footpath": "Potential footpath obstruction",
                                "road_obstruction": "Potential road obstruction",
                                "restricted": "Vehicle in a restricted zone",
                            }
                            label = zone_labels.get(zone_type, "Potential zone obstruction")
                            snapshot = snapshots / f"track-{key_id}-zone-{uuid.uuid4().hex[:6]}.jpg"
                            cv2.imwrite(str(snapshot), annotated)
                            class_name = (
                                model.names.get(int(class_id), str(class_id))
                                if isinstance(model.names, dict)
                                else model.names[int(class_id)]
                            )
                            candidates.append(
                                {
                                    "id": f"CW-{uuid.uuid4().hex[:8].upper()}",
                                    "title": label,
                                    "category": zone.get("name", "Configured monitoring zone"),
                                    "confidence": float(confidence),
                                    "track_id": key_id,
                                    "timestamp_seconds": timestamp,
                                    "zone_name": zone.get("name", "Configured zone"),
                                    "evidence_path": str(snapshot),
                                    "note": (
                                        f"Tracked {class_name} remained still inside the configured polygon "
                                        f"for approximately {threshold:g} seconds. Stillness uses a pixel-motion "
                                        "heuristic and requires operator verification; it is not calibrated speed "
                                        "measurement or proof of an offence."
                                    ),
                                }
                            )

            # Forget a track-zone dwell timer after the object has left for >1 second.
            for event_key in list(stationary_since):
                if timestamp - last_inside.get(event_key, timestamp) > 1.0:
                    stationary_since.pop(event_key, None)
            for event_key in list(last_inside):
                if event_key not in inside_now and timestamp - last_inside[event_key] > 1.0:
                    last_inside.pop(event_key, None)

            writer.write(annotated)
            if progress and frames_done % max(int(fps), 1) == 0:
                progress(frames_done, total_frames, time.monotonic() - started)
    finally:
        capture.release()
        writer.release()

    if frames_done == 0:
        raise RuntimeError("No frames could be read from the uploaded video.")

    if progress:
        progress(frames_done, total_frames, time.monotonic() - started)
    return {
        "frames_processed": frames_done,
        "total_frames": total_frames,
        "annotated_video": str(output_video),
        "incidents": candidates,
        "device": device_name(),
    }
