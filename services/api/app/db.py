from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from contextlib import contextmanager
from typing import Iterator

DATA_DIR = Path(os.getenv("CIVICWATCH_DATA_DIR", Path.home() / ".civicwatch"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = Path(os.getenv("CIVICWATCH_DB_PATH", DATA_DIR / "civicwatch.sqlite3"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS incidents (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
 location TEXT NOT NULL DEFAULT '', camera TEXT NOT NULL DEFAULT '',
 detected_at TEXT NOT NULL, confidence REAL NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'Pending review', severity TEXT NOT NULL DEFAULT 'Medium',
 note TEXT NOT NULL DEFAULT '', evidence_path TEXT, clip_path TEXT,
 track_id TEXT, source_job TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS zones (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, zone_type TEXT NOT NULL,
 camera_id TEXT NOT NULL DEFAULT '', points_json TEXT NOT NULL,
 dwell_seconds REAL NOT NULL DEFAULT 20, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, filename TEXT NOT NULL, status TEXT NOT NULL,
 progress REAL NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL,
 entity_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL DEFAULT 'local operator',
 details TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""

@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    db = sqlite3.connect(DB_PATH, timeout=30)
    db.row_factory = sqlite3.Row
    try:
        yield db
        db.commit()
    finally:
        db.close()

def init_db() -> None:
    with connect() as db:
        db.executescript(SCHEMA)

def audit(entity_type: str, entity_id: str, action: str, details: str = "") -> None:
    with connect() as db:
        db.execute(
            "INSERT INTO audit_log(entity_type,entity_id,action,details) VALUES(?,?,?,?)",
            (entity_type, entity_id, action, details),
        )
