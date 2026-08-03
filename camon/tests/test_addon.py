from types import SimpleNamespace

from camon.addon import CamonAddon
from camon.config import AppConfig


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
