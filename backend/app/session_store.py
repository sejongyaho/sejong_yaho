import json
import sqlite3
from datetime import datetime, timezone
from threading import Lock

from .config import SESSION_STORE_PATH
from .models import MetricSample, SessionState


_DB_LOCK = Lock()


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(SESSION_STORE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_session_store() -> None:
    SESSION_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _DB_LOCK, _connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                script TEXT NOT NULL,
                created_at TEXT NOT NULL,
                materials_json TEXT NOT NULL,
                reference_video_json TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS session_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_session_metrics_session_id
            ON session_metrics(session_id, id)
            """
        )
        connection.commit()


def save_session(session: SessionState) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with _DB_LOCK, _connect() as connection:
        connection.execute(
            """
            INSERT INTO sessions (id, script, created_at, materials_json, reference_video_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                script = excluded.script,
                materials_json = excluded.materials_json,
                reference_video_json = excluded.reference_video_json,
                updated_at = excluded.updated_at
            """,
            (
                session.id,
                session.script,
                session.created_at,
                json.dumps(session.materials, ensure_ascii=False),
                json.dumps(session.reference_video, ensure_ascii=False) if session.reference_video else None,
                now,
            ),
        )
        connection.commit()


def append_metric(session_id: str, sample: MetricSample) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with _DB_LOCK, _connect() as connection:
        connection.execute(
            """
            INSERT INTO session_metrics (session_id, payload_json, created_at)
            VALUES (?, ?, ?)
            """,
            (
                session_id,
                json.dumps(sample.model_dump(), ensure_ascii=False),
                now,
            ),
        )
        connection.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            (now, session_id),
        )
        connection.commit()


def load_session(session_id: str) -> SessionState | None:
    with _DB_LOCK, _connect() as connection:
        session_row = connection.execute(
            """
            SELECT id, script, created_at, materials_json, reference_video_json
            FROM sessions
            WHERE id = ?
            """,
            (session_id,),
        ).fetchone()
        if not session_row:
            return None

        metric_rows = connection.execute(
            """
            SELECT payload_json
            FROM session_metrics
            WHERE session_id = ?
            ORDER BY id
            """,
            (session_id,),
        ).fetchall()

    return SessionState(
        id=session_row["id"],
        script=session_row["script"],
        created_at=session_row["created_at"],
        materials=json.loads(session_row["materials_json"] or "[]"),
        reference_video=json.loads(session_row["reference_video_json"]) if session_row["reference_video_json"] else None,
        samples=[MetricSample(**json.loads(row["payload_json"])) for row in metric_rows],
    )
