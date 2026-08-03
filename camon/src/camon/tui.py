"""Live Textual dashboard, with six data views."""

from __future__ import annotations

from textual.app import App, ComposeResult
from textual.widgets import DataTable, Footer, Header, Static, TabbedContent, TabPane

from .config import AppConfig
from .runtime import detect_mitmproxy
from .storage import Storage


class CamonApp(App[None]):  # type: ignore[misc]
    TITLE = "CAMON — Coding Agent Monitor"
    BINDINGS = [("q", "quit", "Quit")]

    def __init__(self, config: AppConfig | None = None) -> None:
        super().__init__()
        self.config = config or AppConfig.load()
        self.storage = Storage(self.config.database_path)

    def compose(self) -> ComposeResult:
        yield Header()
        with TabbedContent(initial="overview"):
            with TabPane("Overview", id="overview"):
                yield Static(id="overview_text")
            for name in ("Agents", "Sessions", "Requests", "Providers", "Runtime"):
                with TabPane(name, id=name.lower()):
                    yield DataTable(id=f"{name.lower()}_table")
        yield Footer()

    def on_mount(self) -> None:
        self.set_interval(self.config.refresh_seconds, self.refresh_data)
        self.refresh_data()

    def refresh_data(self) -> None:
        proxy = detect_mitmproxy()
        health = "healthy" if self.storage.addon_healthy() else "not reporting"
        self.query_one("#overview_text", Static).update(
            f"mitmproxy: {'running' if proxy.running else 'not detected'} | addon: {health}\n"
            f"database: {self.config.database_path}"
        )
        self._fill("agents_table", self.storage.summary(), ("agent", "provider", "model", "request_count"))
        self._fill("sessions_table", self.storage.sessions(), ("session_key", "agent", "request_count", "last_seen_at"))
        self._fill("requests_table", self.storage.recent_requests(), ("timestamp", "agent", "provider", "model", "status_code"))
        self._fill("providers_table", self.storage.provider_summary(), ("provider", "model", "request_count", "input_tokens", "output_tokens"))
        runtime: dict[str, object] = {
            "mitmproxy": str(proxy.running),
            "pids": ", ".join(map(str, proxy.pids)),
            "addon": health,
        }
        self._fill("runtime_table", [runtime], ("mitmproxy", "pids", "addon"))

    def _fill(self, table_id: str, rows: list[dict[str, object]], columns: tuple[str, ...]) -> None:
        table = self.query_one(f"#{table_id}", DataTable)
        table.clear(columns=True)
        table.add_columns(*columns)
        for row in rows:
            table.add_row(*(str(row.get(column, "")) for column in columns))
