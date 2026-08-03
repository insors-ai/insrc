from datetime import UTC, datetime, timedelta

from camon.models import AddonStatus, Attribution, UsageEvent
from camon.storage import DEFAULT_AGENT_LOG_DIR, Storage


def test_storage_records_request_session_and_daily_usage(tmp_path):
    storage = Storage(tmp_path / "camon.sqlite3")
    event = UsageEvent(
        timestamp=datetime.now(UTC), method="POST", host="api.openai.com", path="/v1/responses",
        provider="openai", model="gpt-test", input_tokens=12, output_tokens=3,
        session_key="request-1", attribution=Attribution(agent="codex-cli", source="http", confidence=0.4),
    )
    storage.record(event)

    assert storage.recent_requests()[0]["host"] == "api.openai.com"
    assert storage.sessions()[0]["request_count"] == 1
    assert storage.sessions()[0]["source"] == "reported"
    assert storage.summary()[0]["input_tokens"] == 12


def test_storage_derives_activity_window_when_session_header_is_missing(tmp_path):
    storage = Storage(tmp_path / "camon.sqlite3")
    storage.record(
        UsageEvent(
            timestamp=datetime.now(UTC), method="POST", host="api.anthropic.com", path="/v1/messages",
            provider="anthropic", attribution=Attribution(agent="claude-code"),
        )
    )

    session = storage.sessions()[0]

    assert session["session_key"].startswith("observed:claude-code:")
    assert session["request_count"] == 1
    assert session["source"] == "30 min activity window"


def test_heartbeat_health(tmp_path):
    storage = Storage(tmp_path / "camon.sqlite3")
    assert not storage.addon_healthy()
    storage.heartbeat(AddonStatus(instance_id="test"))
    assert storage.addon_healthy()


def test_storage_purges_data_outside_retention_window(tmp_path):
    database = tmp_path / "camon.sqlite3"
    storage = Storage(database, retention_days=7)
    storage.record(
        UsageEvent(
            timestamp=datetime.now(UTC) - timedelta(days=8), method="GET", host="api.openai.com", path="/",
            provider="openai", attribution=Attribution(), session_key="expired-session",
        )
    )

    fresh_storage = Storage(database, retention_days=7)

    assert fresh_storage.recent_requests() == []
    assert fresh_storage.sessions() == []
    assert fresh_storage.summary() == []
    stats = fresh_storage.overview_stats()
    assert stats["last_pruned_at"] is not None
    assert stats["last_pruned_records"] == 3


def test_storage_overview_stats(tmp_path):
    storage = Storage(tmp_path / "camon.sqlite3")
    storage.record(
        UsageEvent(
            timestamp=datetime.now(UTC), method="POST", host="api.openai.com", path="/v1/responses",
            provider="openai", session_key="session-1", attribution=Attribution(agent="codex-cli"),
        )
    )

    stats = storage.overview_stats()

    assert stats["request_count"] == 1
    assert stats["session_count"] == 1
    assert stats["agent_count"] == 1
    assert stats["provider_count"] == 1
    assert stats["last_request_at"] is not None
    assert stats["database_bytes"] >= 0


def test_storage_activity_series_includes_empty_days(tmp_path):
    storage = Storage(tmp_path / "camon.sqlite3")
    storage.record(
        UsageEvent(
            timestamp=datetime.now(UTC), method="POST", host="api.openai.com", path="/v1/responses",
            provider="openai", input_tokens=10, output_tokens=5, attribution=Attribution(agent="codex-cli"),
        )
    )

    activity = storage.activity_series(days=3)

    assert len(activity) == 3
    assert activity[-1]["request_count"] == 1
    assert activity[-1]["token_count"] == 15
    assert activity[0]["request_count"] == 0


def test_storage_persists_per_agent_logging_preferences(tmp_path):
    storage = Storage(tmp_path / "camon.sqlite3")
    log_dir = tmp_path / "traffic"

    storage.configure_agent_logging("claude-code", True, log_dir, max_bytes=1024)

    assert storage.agent_logging_settings() == {
        "claude-code": {"enabled": True, "log_dir": str(log_dir), "max_bytes": 1024}
    }
    assert DEFAULT_AGENT_LOG_DIR.is_absolute()
