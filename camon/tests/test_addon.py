import json
from types import SimpleNamespace

from camon.addon import CamonAddon
from camon.config import AppConfig
from camon.storage import Storage


def test_addon_records_completed_flow_without_mutating_flow(tmp_path):
    addon = CamonAddon(AppConfig(database_path=tmp_path / "camon.sqlite3"))
    request = SimpleNamespace(
        pretty_url="https://api.openai.com/v1/responses?secret=not-stored",
        headers={"user-agent": "codex"}, method="POST", timestamp_start=1.0,
    )
    response = SimpleNamespace(
        status_code=200,
        content=b'{"model":"gpt-test","usage":{"input_tokens":4,"output_tokens":2}}',
        timestamp_end=1.5,
    )
    flow = SimpleNamespace(request=request, response=response, client_conn=SimpleNamespace(peername=("", 0)))

    addon.response(flow)

    recorded = addon.storage.recent_requests()[0]
    assert recorded["path"] == "/v1/responses"
    assert recorded["input_tokens"] == 4
    assert flow.request is request
    assert flow.response is response


def test_addon_writes_and_rotates_enabled_agent_traffic_logs(tmp_path):
    database = tmp_path / "camon.sqlite3"
    addon = CamonAddon(AppConfig(database_path=database))
    log_dir = tmp_path / "logs"
    Storage(database).configure_agent_logging("codex-cli", True, log_dir, max_bytes=1)
    request = SimpleNamespace(
        pretty_url="https://api.openai.com/v1/responses?secret=not-stored",
        headers={"user-agent": "codex"}, method="POST", timestamp_start=1.0, content=b"prompt",
    )
    response = SimpleNamespace(status_code=200, content=b'{"model":"gpt-test"}', timestamp_end=1.5)
    flow = SimpleNamespace(request=request, response=response)

    addon.response(flow)
    addon.response(flow)

    target = next(log_dir.glob("codex-cli.*.log"))
    previous = target.with_name(f"{target.name}.1")
    entry = json.loads(target.read_text(encoding="utf-8"))
    assert previous.exists()
    assert entry["agent"] == "codex-cli"
    assert entry["path"] == "/v1/responses"
    assert "secret" not in target.read_text(encoding="utf-8")
