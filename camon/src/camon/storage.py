"""SQLite persistence for normalized CAMON observations."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .models import AddonStatus, UsageEvent

DEFAULT_AGENT_LOG_DIR = Path("/tmp/.insrc/camon")
DEFAULT_AGENT_LOG_MAX_BYTES = 10 * 1024 * 1024

SCHEMA = """
CREATE TABLE IF NOT EXISTS addon_status (
    instance_id TEXT PRIMARY KEY, seen_at TEXT NOT NULL, version TEXT NOT NULL, pid INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY, session_key TEXT UNIQUE NOT NULL, agent TEXT NOT NULL,
    started_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, request_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, method TEXT NOT NULL, host TEXT NOT NULL,
    path TEXT NOT NULL, status_code INTEGER, provider TEXT NOT NULL, model TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_tokens INTEGER NOT NULL DEFAULT 0, duration_ms REAL, session_key TEXT,
    agent TEXT NOT NULL, pid INTEGER, process_name TEXT, attribution_source TEXT NOT NULL,
    attribution_confidence REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp);
CREATE INDEX IF NOT EXISTS idx_requests_session ON requests(session_key);
CREATE TABLE IF NOT EXISTS daily_usage (
    day TEXT NOT NULL, agent TEXT NOT NULL, provider TEXT NOT NULL, model TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
    request_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(day, agent, provider, model)
);
CREATE TABLE IF NOT EXISTS process_instances (
    pid INTEGER NOT NULL, started_at TEXT NOT NULL, process_name TEXT NOT NULL,
    command_line TEXT, agent TEXT NOT NULL, PRIMARY KEY(pid, started_at)
);
CREATE TABLE IF NOT EXISTS agent_rules (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, pattern TEXT NOT NULL UNIQUE,
    priority INTEGER NOT NULL DEFAULT 100, enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS maintenance_status (
    name TEXT PRIMARY KEY, completed_at TEXT NOT NULL, records_removed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS agent_logging (
    agent TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0, 1)),
    log_dir TEXT NOT NULL, max_bytes INTEGER NOT NULL DEFAULT 10485760 CHECK(max_bytes > 0),
    updated_at TEXT NOT NULL
);
"""


class Storage:
    def __init__(self, database_path: Path | str, retention_days: int = 7) -> None:
        self.path = Path(database_path)
        self.retention_days = retention_days
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connection() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA foreign_keys=ON")
            connection.executescript(SCHEMA)
        self.purge_expired()

    def purge_expired(self) -> None:
        """Remove observations outside the configured retention window."""
        cutoff = datetime.now(UTC) - timedelta(days=self.retention_days)
        cutoff_timestamp = cutoff.isoformat()
        cutoff_day = cutoff.date().isoformat()
        with self.connection() as connection:
            removed = sum(
                connection.execute(statement, (value,)).rowcount
                for statement, value in (
                    ("DELETE FROM requests WHERE timestamp < ?", cutoff_timestamp),
                    ("DELETE FROM sessions WHERE last_seen_at < ?", cutoff_timestamp),
                    ("DELETE FROM daily_usage WHERE day < ?", cutoff_day),
                    ("DELETE FROM addon_status WHERE seen_at < ?", cutoff_timestamp),
                    ("DELETE FROM process_instances WHERE started_at < ?", cutoff_timestamp),
                )
            )
            connection.execute(
                """INSERT INTO maintenance_status(name, completed_at, records_removed) VALUES ('retention_purge', ?, ?)
                ON CONFLICT(name) DO UPDATE SET completed_at=excluded.completed_at, records_removed=excluded.records_removed""",
                (datetime.now(UTC).isoformat(), removed),
            )

    def heartbeat(self, status: AddonStatus) -> None:
        with self.connection() as connection:
            connection.execute(
                """INSERT INTO addon_status(instance_id, seen_at, version, pid) VALUES (?, ?, ?, ?)
                ON CONFLICT(instance_id) DO UPDATE SET seen_at=excluded.seen_at,
                version=excluded.version, pid=excluded.pid""",
                (status.instance_id, status.seen_at.isoformat(), status.version, status.pid),
            )

    def record(self, event: UsageEvent) -> int:
        timestamp = event.timestamp.astimezone(UTC).isoformat()
        values = (
            timestamp, event.method, event.host, event.path, event.status_code, event.provider,
            event.model, event.input_tokens, event.output_tokens, int(event.estimated_tokens),
            event.duration_ms, event.session_key, event.attribution.agent, event.attribution.pid,
            event.attribution.process_name, event.attribution.source, event.attribution.confidence,
        )
        with self.connection() as connection:
            cursor = connection.execute(
                """INSERT INTO requests(timestamp, method, host, path, status_code, provider, model,
                input_tokens, output_tokens, estimated_tokens, duration_ms, session_key, agent, pid,
                process_name, attribution_source, attribution_confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                values,
            )
            if event.session_key:
                connection.execute(
                    """INSERT INTO sessions(session_key, agent, started_at, last_seen_at, request_count)
                    VALUES (?, ?, ?, ?, 1) ON CONFLICT(session_key) DO UPDATE SET
                    last_seen_at=excluded.last_seen_at, request_count=request_count + 1""",
                    (event.session_key, event.attribution.agent, timestamp, timestamp),
                )
            day = event.timestamp.astimezone(UTC).date().isoformat()
            connection.execute(
                """INSERT INTO daily_usage(day, agent, provider, model, input_tokens, output_tokens, request_count)
                VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(day, agent, provider, model) DO UPDATE SET
                input_tokens=input_tokens + excluded.input_tokens,
                output_tokens=output_tokens + excluded.output_tokens, request_count=request_count + 1""",
                (day, event.attribution.agent, event.provider, event.model, event.input_tokens, event.output_tokens),
            )
            return int(cursor.lastrowid or 0)

    def addon_healthy(self, max_age_seconds: float = 10.0) -> bool:
        cutoff = (datetime.now(UTC) - timedelta(seconds=max_age_seconds)).isoformat()
        with self.connection() as connection:
            row = connection.execute("SELECT 1 FROM addon_status WHERE seen_at >= ? LIMIT 1", (cutoff,)).fetchone()
        return row is not None

    def summary(self, days: int = 30) -> list[dict[str, Any]]:
        cutoff = (datetime.now(UTC).date() - timedelta(days=days - 1)).isoformat()
        with self.connection() as connection:
            rows = connection.execute(
                """SELECT agent, provider, model, SUM(input_tokens) AS input_tokens,
                SUM(output_tokens) AS output_tokens, SUM(request_count) AS request_count
                FROM daily_usage WHERE day >= ? GROUP BY agent, provider, model
                ORDER BY request_count DESC""", (cutoff,)
            ).fetchall()
        return [dict(row) for row in rows]

    def recent_requests(self, limit: int = 50) -> list[dict[str, Any]]:
        with self.connection() as connection:
            rows = connection.execute("SELECT * FROM requests ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [dict(row) for row in rows]

    def sessions(self, limit: int = 50) -> list[dict[str, Any]]:
        with self.connection() as connection:
            rows = connection.execute(
                """SELECT session_key, agent, request_count, last_seen_at, 'reported' AS source FROM sessions
                UNION ALL
                SELECT 'observed:' || agent || ':' || strftime('%Y-%m-%d %H:', timestamp) ||
                       CASE WHEN CAST(strftime('%M', timestamp) AS INTEGER) < 30 THEN '00' ELSE '30' END,
                       agent, COUNT(*), MAX(timestamp), '30 min activity window'
                FROM requests WHERE session_key IS NULL
                GROUP BY agent, strftime('%Y-%m-%d %H:', timestamp),
                         CASE WHEN CAST(strftime('%M', timestamp) AS INTEGER) < 30 THEN '00' ELSE '30' END
                ORDER BY last_seen_at DESC LIMIT ?""",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def provider_summary(self) -> list[dict[str, Any]]:
        with self.connection() as connection:
            rows = connection.execute(
                """SELECT provider, model, COUNT(*) AS request_count, SUM(input_tokens) AS input_tokens,
                SUM(output_tokens) AS output_tokens FROM requests GROUP BY provider, model
                ORDER BY request_count DESC"""
            ).fetchall()
        return [dict(row) for row in rows]

    def agent_logging_settings(self) -> dict[str, dict[str, object]]:
        """Return persistent per-agent traffic logging preferences."""
        with self.connection() as connection:
            rows = connection.execute("SELECT agent, enabled, log_dir, max_bytes FROM agent_logging").fetchall()
        return {
            str(row["agent"]): {
                "enabled": bool(row["enabled"]),
                "log_dir": str(row["log_dir"]),
                "max_bytes": int(row["max_bytes"]),
            }
            for row in rows
        }

    def configure_agent_logging(
        self, agent: str, enabled: bool, log_dir: Path | str, max_bytes: int = DEFAULT_AGENT_LOG_MAX_BYTES
    ) -> None:
        """Persist one agent's log destination and enabled state."""
        directory = Path(log_dir).expanduser()
        if not agent or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_." for character in agent):
            raise ValueError("Agent name contains unsupported characters.")
        if not directory.is_absolute():
            raise ValueError("Log directory must be an absolute path.")
        if max_bytes < 1:
            raise ValueError("Maximum log size must be positive.")
        directory.mkdir(parents=True, exist_ok=True)
        with self.connection() as connection:
            connection.execute(
                """INSERT INTO agent_logging(agent, enabled, log_dir, max_bytes, updated_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(agent) DO UPDATE SET enabled=excluded.enabled, log_dir=excluded.log_dir,
                max_bytes=excluded.max_bytes, updated_at=excluded.updated_at""",
                (agent, int(enabled), str(directory), max_bytes, datetime.now(UTC).isoformat()),
            )

    def activity_series(self, days: int = 14) -> list[dict[str, Any]]:
        """Return a gap-free daily request and token series for the activity graph."""
        today = datetime.now(UTC).date()
        first_day = today - timedelta(days=days - 1)
        with self.connection() as connection:
            rows = connection.execute(
                """SELECT day, SUM(request_count) AS request_count,
                SUM(input_tokens + output_tokens) AS token_count
                FROM daily_usage WHERE day >= ? GROUP BY day""",
                (first_day.isoformat(),),
            ).fetchall()
        totals = {
            str(row["day"]): (int(row["request_count"] or 0), int(row["token_count"] or 0))
            for row in rows
        }
        return [
            {
                "day": (first_day + timedelta(days=offset)).isoformat(),
                "request_count": totals.get((first_day + timedelta(days=offset)).isoformat(), (0, 0))[0],
                "token_count": totals.get((first_day + timedelta(days=offset)).isoformat(), (0, 0))[1],
            }
            for offset in range(days)
        ]

    def overview_stats(self) -> dict[str, Any]:
        """Return compact dashboard statistics without retaining request payloads."""
        with self.connection() as connection:
            totals = connection.execute(
                """SELECT COUNT(*) AS request_count, COUNT(DISTINCT agent) AS agent_count,
                COUNT(DISTINCT provider) AS provider_count, MAX(timestamp) AS last_request_at FROM requests"""
            ).fetchone()
            sessions = connection.execute("SELECT COUNT(*) AS session_count FROM sessions").fetchone()
            maintenance = connection.execute(
                "SELECT completed_at, records_removed FROM maintenance_status WHERE name = 'retention_purge'"
            ).fetchone()
        database_bytes = sum(
            candidate.stat().st_size
            for candidate in (self.path, self.path.with_name(f"{self.path.name}-wal"), self.path.with_name(f"{self.path.name}-shm"))
            if candidate.exists()
        )
        return {
            "database_bytes": database_bytes,
            "retention_days": self.retention_days,
            "request_count": int(totals["request_count"] if totals else 0),
            "session_count": int(sessions["session_count"] if sessions else 0),
            "agent_count": int(totals["agent_count"] if totals else 0),
            "provider_count": int(totals["provider_count"] if totals else 0),
            "last_request_at": totals["last_request_at"] if totals else None,
            "last_pruned_at": maintenance["completed_at"] if maintenance else None,
            "last_pruned_records": int(maintenance["records_removed"] if maintenance else 0),
        }
