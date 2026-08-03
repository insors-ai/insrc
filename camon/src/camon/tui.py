"""Live Textual dashboard, with six data views."""

from __future__ import annotations

from textual.app import App, ComposeResult
from textual.widgets import DataTable, Footer, Header, Static, TabbedContent, TabPane

from .config import AppConfig
from .runtime import detect_mitmproxy
from .setup import AgentSetup, detect_agents, setup_agent
from .storage import Storage


class CamonApp(App[None]):  # type: ignore[misc]
    TITLE = "CAMON — Coding Agent Monitor"
    BINDINGS = [
        ("1", "show_overview", "Overview"),
        ("2", "show_setup", "Setup"),
        ("3", "show_agents", "Agents"),
        ("4", "show_sessions", "Sessions"),
        ("5", "show_requests", "Requests"),
        ("6", "show_providers", "Providers"),
        ("7", "show_runtime", "Runtime"),
        ("e", "enable_proxy", "Enable selected agent"),
        ("q", "quit", "Quit"),
    ]

    def __init__(self, config: AppConfig | None = None) -> None:
        super().__init__()
        self.config = config or AppConfig.load()
        self.storage = Storage(self.config.database_path, self.config.retention_days)
        self.agent_setups: list[AgentSetup] = []

    def compose(self) -> ComposeResult:
        yield Header()
        with TabbedContent(initial="overview"):
            with TabPane("Overview", id="overview"):
                yield Static(id="overview_text")
            with TabPane("Setup", id="setup"):
                yield Static("Select an agent and press [b]e[/b] to configure its opt-in proxy routing.", id="setup_help")
                yield DataTable(id="setup_table")
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
        self._refresh_setup()

    def _refresh_setup(self, force: bool = False) -> None:
        """Refresh Setup without stealing its keyboard selection during navigation."""
        table = self.query_one("#setup_table", DataTable)
        if table.has_focus and not force:
            return
        self.agent_setups = detect_agents(self.config.proxy_url)
        setup_rows: list[dict[str, object]] = [
            {
                "agent": item.agent,
                "detected": "yes" if item.detected else "no",
                "status": item.status,
                "method": item.setup_method,
                "configured": str(item.setup_ready).lower(),
            }
            for item in self.agent_setups
        ]
        self._fill("setup_table", setup_rows, ("agent", "detected", "status", "method", "configured"))

    def on_tabbed_content_tab_activated(self, event: TabbedContent.TabActivated) -> None:
        """Make the Setup table immediately keyboard-navigable on opening its tab."""
        if event.pane.id == "setup":
            self.call_after_refresh(self.query_one("#setup_table", DataTable).focus)

    def _show_tab(self, tab_id: str) -> None:
        self.query_one(TabbedContent).active = tab_id

    def action_show_overview(self) -> None:
        self._show_tab("overview")

    def action_show_setup(self) -> None:
        self._show_tab("setup")

    def action_show_agents(self) -> None:
        self._show_tab("agents")

    def action_show_sessions(self) -> None:
        self._show_tab("sessions")

    def action_show_requests(self) -> None:
        self._show_tab("requests")

    def action_show_providers(self) -> None:
        self._show_tab("providers")

    def action_show_runtime(self) -> None:
        self._show_tab("runtime")

    def action_enable_proxy(self) -> None:
        """Create a per-agent launcher for the selected setup-table row."""
        table = self.query_one("#setup_table", DataTable)
        row = table.cursor_row
        if not 0 <= row < len(self.agent_setups):
            self.notify("Select an agent in the Setup tab first.", severity="warning")
            return
        item = self.agent_setups[row]
        try:
            target = setup_agent(item.agent, self.config.proxy_url, item.executable)
        except (FileNotFoundError, ValueError) as error:
            self.notify(str(error), severity="error")
            return
        if item.agent == "claude-code":
            self.notify(f"Updated {target}. Restart Claude Code to apply the proxy settings.")
        else:
            self.notify(f"Created {target}. Start {item.agent} through this launcher.")
        self.refresh_data()
        self._refresh_setup(force=True)

    def _fill(self, table_id: str, rows: list[dict[str, object]], columns: tuple[str, ...]) -> None:
        table = self.query_one(f"#{table_id}", DataTable)
        table.clear(columns=True)
        table.add_columns(*columns)
        for row in rows:
            table.add_row(*(str(row.get(column, "")) for column in columns))
