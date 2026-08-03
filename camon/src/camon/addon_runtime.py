"""Dependency-free mitmproxy addon runtime.

mitmproxy's packaged binaries execute ``-s`` scripts in an isolated Python
environment. This module intentionally uses only the standard library so the
addon can run with Homebrew and other bundled mitmproxy installations.
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import threading
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

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
CREATE TABLE IF NOT EXISTS maintenance_status (
    name TEXT PRIMARY KEY, completed_at TEXT NOT NULL, records_removed INTEGER NOT NULL DEFAULT 0
);
"""


def _default_database_path() -> Path:
    configured = os.environ.get("CAMON_DATABASE")
    if configured:
        return Path(configured)
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "camon" / "camon.sqlite3"
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "camon" / "camon.sqlite3"


def _retention_days() -> int:
    value = os.environ.get("CAMON_RETENTION_DAYS", "7")
    try:
        return max(1, int(value))
    except ValueError:
        return 7


def _provider(host: str) -> str:
    lowered = host.lower()
    for needle, provider in (("openai", "openai"), ("anthropic", "anthropic"), ("google", "google"), ("mistral", "mistral"), ("x.ai", "xai")):
        if needle in lowered:
            return provider
    return lowered.split(".")[-2] if "." in lowered else "unknown"


def _agent(user_agent: str) -> tuple[str, str, float]:
    lowered = user_agent.lower()
    known_agents = (
        ("claude", "claude-code"), ("codex", "codex-cli"), ("cursor", "cursor"),
        ("continue", "continue"), ("cline", "cline"), ("roo", "roo-code"), ("aider", "aider"),
    )
    for needle, name in known_agents:
        if needle in lowered:
            return name, "http", 0.35
    return "unknown", "unknown", 0.0


def _usage(content: bytes | None) -> tuple[str | None, int, int, bool]:
    if content:
        try:
            document = json.loads(content)
            if isinstance(document, dict) and isinstance(document.get("usage") or document.get("usageMetadata"), dict):
                usage = document.get("usage") or document.get("usageMetadata")
                assert isinstance(usage, dict)
                model = document.get("model") if isinstance(document.get("model"), str) else None
                input_tokens = usage.get("input_tokens", usage.get("prompt_tokens", usage.get("promptTokenCount", 0)))
                output_tokens = usage.get("output_tokens", usage.get("completion_tokens", usage.get("candidatesTokenCount", 0)))
                valid_input = int(input_tokens) if isinstance(input_tokens, int) and input_tokens >= 0 else 0
                valid_output = int(output_tokens) if isinstance(output_tokens, int) and output_tokens >= 0 else 0
                return model, valid_input, valid_output, False
        except (UnicodeDecodeError, json.JSONDecodeError, TypeError, ValueError):
            pass
    return None, 0, len(content or b"") // 4, True


class AddonStorage:
    def __init__(self, path: Path, retention_days: int) -> None:
        self.path = path
        self.retention_days = retention_days
        self.last_purge = 0.0
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.executescript(SCHEMA)
        self.purge_expired()

    def _connection(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)

    def heartbeat(self, instance_id: str) -> None:
        self._maybe_purge()
        with self._connection() as connection:
            connection.execute(
                """INSERT INTO addon_status(instance_id, seen_at, version, pid) VALUES (?, ?, ?, ?)
                ON CONFLICT(instance_id) DO UPDATE SET seen_at=excluded.seen_at, version=excluded.version, pid=excluded.pid""",
                (instance_id, datetime.now(UTC).isoformat(), "0.1.0", os.getpid()),
            )

    def purge_expired(self) -> None:
        cutoff = datetime.now(UTC).timestamp() - self.retention_days * 24 * 60 * 60
        cutoff_timestamp = datetime.fromtimestamp(cutoff, UTC).isoformat()
        cutoff_day = cutoff_timestamp[:10]
        with self._connection() as connection:
            removed = sum(
                connection.execute(statement, (value,)).rowcount
                for statement, value in (
                    ("DELETE FROM requests WHERE timestamp < ?", cutoff_timestamp),
                    ("DELETE FROM sessions WHERE last_seen_at < ?", cutoff_timestamp),
                    ("DELETE FROM daily_usage WHERE day < ?", cutoff_day),
                    ("DELETE FROM addon_status WHERE seen_at < ?", cutoff_timestamp),
                )
            )
            connection.execute(
                """INSERT INTO maintenance_status(name, completed_at, records_removed) VALUES ('retention_purge', ?, ?)
                ON CONFLICT(name) DO UPDATE SET completed_at=excluded.completed_at, records_removed=excluded.records_removed""",
                (datetime.now(UTC).isoformat(), removed),
            )
        self.last_purge = time.monotonic()

    def _maybe_purge(self) -> None:
        if time.monotonic() - self.last_purge >= 3600:
            self.purge_expired()

    def record(self, values: tuple[Any, ...], day: str) -> None:
        with self._connection() as connection:
            connection.execute(
                """INSERT INTO requests(timestamp, method, host, path, status_code, provider, model,
                input_tokens, output_tokens, estimated_tokens, duration_ms, session_key, agent, pid,
                process_name, attribution_source, attribution_confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                values,
            )
            session_key = values[11]
            if session_key:
                connection.execute(
                    """INSERT INTO sessions(session_key, agent, started_at, last_seen_at, request_count)
                    VALUES (?, ?, ?, ?, 1) ON CONFLICT(session_key) DO UPDATE SET
                    last_seen_at=excluded.last_seen_at, request_count=request_count + 1""",
                    (session_key, values[12], values[0], values[0]),
                )
            connection.execute(
                """INSERT INTO daily_usage(day, agent, provider, model, input_tokens, output_tokens, request_count)
                VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(day, agent, provider, model) DO UPDATE SET
                input_tokens=input_tokens + excluded.input_tokens,
                output_tokens=output_tokens + excluded.output_tokens, request_count=request_count + 1""",
                (day, values[12], values[5], values[6], values[7], values[8]),
            )

    def recent_requests(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._connection() as connection:
            cursor = connection.execute("SELECT * FROM requests ORDER BY id DESC LIMIT ?", (limit,))
            columns = [description[0] for description in cursor.description or ()]
            return [dict(zip(columns, row, strict=True)) for row in cursor.fetchall()]


class CamonAddon:
    def __init__(self, config: Any = None) -> None:
        configured_path = getattr(config, "database_path", None)
        self.database_path = Path(configured_path) if configured_path else _default_database_path()
        self.retention_days = _retention_days()
        self._storage: AddonStorage | None = None
        self.instance_id = str(uuid.uuid4())
        self.last_heartbeat = 0.0
        self.stop_heartbeat = threading.Event()
        self.heartbeat_thread: threading.Thread | None = None

    @property
    def storage(self) -> AddonStorage:
        if self._storage is None:
            self._storage = AddonStorage(self.database_path, self.retention_days)
        return self._storage

    def running(self) -> None:
        self._heartbeat()
        if self.heartbeat_thread is None:
            self.heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True, name="camon-heartbeat")
            self.heartbeat_thread.start()

    def tick(self) -> None:
        """mitmproxy invokes this hook regularly even when no traffic flows."""
        self._heartbeat()

    def done(self) -> None:
        self.stop_heartbeat.set()

    def _heartbeat_loop(self) -> None:
        while not self.stop_heartbeat.wait(2):
            try:
                self._heartbeat()
            except sqlite3.Error:
                # Monitoring must not interfere with proxy traffic if storage is unavailable.
                continue

    def response(self, flow: Any) -> None:
        self._heartbeat()
        request, response = flow.request, flow.response
        parsed = urlparse(request.pretty_url)
        host, path = parsed.hostname or "unknown", parsed.path or "/"
        content = getattr(response, "content", None)
        model, input_tokens, output_tokens, estimated = _usage(content)
        if estimated:
            input_tokens = len(getattr(request, "content", None) or b"") // 4
        started, ended = getattr(request, "timestamp_start", None), getattr(response, "timestamp_end", None)
        duration = (ended - started) * 1000 if isinstance(started, (int, float)) and isinstance(ended, (int, float)) else None
        agent, source, confidence = _agent(request.headers.get("user-agent", ""))
        session = request.headers.get("x-session-id") or request.headers.get("openai-conversation-id") or request.headers.get("anthropic-conversation-id")
        timestamp = datetime.now(UTC)
        values = (
            timestamp.isoformat(), request.method, host, path, response.status_code, _provider(host), model,
            input_tokens, output_tokens, int(estimated), duration, session, agent, None, None, source, confidence,
        )
        self.storage.record(values, timestamp.date().isoformat())

    def _heartbeat(self) -> None:
        if time.monotonic() - self.last_heartbeat >= 2:
            self.storage.heartbeat(self.instance_id)
            self.last_heartbeat = time.monotonic()
