from datetime import UTC, datetime, timedelta

from camon.models import AddonStatus, Attribution, UsageEvent
from camon.storage import Storage


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
    assert storage.summary()[0]["input_tokens"] == 12


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
