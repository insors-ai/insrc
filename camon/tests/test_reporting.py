from camon.models import Attribution, UsageEvent
from camon.reporting import export, render_report
from camon.storage import Storage


def test_reports_and_exports(tmp_path):
    storage = Storage(tmp_path / "db.sqlite3")
    storage.record(UsageEvent(method="GET", host="api.openai.com", path="/", provider="openai", attribution=Attribution()))
    assert "CAMON usage" in render_report(storage)
    output = tmp_path / "report.json"
    assert export(storage, output, "json") == 1
    assert '"provider": "openai"' in output.read_text()
