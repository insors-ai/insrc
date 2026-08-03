"""Live Textual dashboard, with six data views."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from rich.text import Text
from textual.app import App, ComposeResult
from textual.containers import Container, Horizontal
from textual.widgets import Button, DataTable, Footer, Header, Input, Static, TabbedContent, TabPane

from .config import AppConfig
from .runtime import detect_mitmproxy
from .setup import AgentSetup, detect_agents, setup_agent
from .storage import DEFAULT_AGENT_LOG_DIR, DEFAULT_AGENT_LOG_MAX_BYTES, Storage


def _format_bytes(value: int) -> str:
    units = ("B", "KiB", "MiB", "GiB")
    size = float(value)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} {unit}"
        size /= 1024
    return f"{value} B"


def _format_uptime(started_at: datetime | None) -> str:
    if started_at is None:
        return "unavailable"
    seconds = max(0, int((datetime.now(UTC) - started_at).total_seconds()))
    days, remainder = divmod(seconds, 86_400)
    hours, remainder = divmod(remainder, 3_600)
    minutes, _ = divmod(remainder, 60)
    if days:
        return f"{days}d {hours}h"
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def _format_timestamp(value: object) -> str:
    if not isinstance(value, str):
        return "never"
    try:
        return datetime.fromisoformat(value).astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")
    except ValueError:
        return value


def _display_path(path: Path) -> str:
    try:
        return f"~/{path.relative_to(Path.home())}"
    except ValueError:
        return str(path)


_COLUMN_STYLES = {
    "agent": "bold bright_cyan",
    "provider": "bold bright_magenta",
    "model": "bright_green",
    "session_key": "cyan",
    "timestamp": "bright_black",
    "last_seen_at": "bright_black",
    "status_code": "bold",
    "request_count": "bold yellow",
    "input_tokens": "yellow",
    "output_tokens": "bright_yellow",
    "estimated_tokens": "yellow",
    "source": "italic bright_black",
    "pids": "cyan",
    "method": "bold blue",
}


def _table_header(column: str) -> Text:
    label = column.replace("_", " ").upper()
    return Text(label, style=f"bold {_COLUMN_STYLES.get(column, 'bright_white')}")


def _table_cell(column: str, value: object) -> Text:
    text = str(value if value is not None else "")
    if column == "status_code":
        try:
            status = int(text)
        except ValueError:
            style = "bold bright_black"
        else:
            style = "bold green" if 200 <= status < 300 else "bold yellow" if status < 500 else "bold red"
    elif column in {"detected", "configured", "mitmproxy"}:
        style = "green" if text.lower() in {"yes", "true", "running"} else "red"
    elif column == "status":
        style = "green" if text in {"routed", "settings ready", "launcher ready"} else "yellow"
    elif column == "logging":
        style = "bold green" if text == "on" else "bright_black"
    else:
        style = _COLUMN_STYLES.get(column, "")
    return Text(text, style=style)


def _sparkline(values: list[int]) -> str:
    if not values or max(values) == 0:
        return "·" * len(values)
    levels = "▁▂▃▄▅▆▇█"
    maximum = max(values)
    return "".join("·" if value == 0 else levels[max(0, (value * (len(levels) - 1)) // maximum)] for value in values)


def _format_token_count(value: int) -> str:
    if value >= 1_000_000:
        return f"{value / 1_000_000:.1f}M"
    if value >= 1_000:
        return f"{value / 1_000:.1f}K"
    return str(value)


def _setting_max_bytes(setting: dict[str, object]) -> int:
    value = setting.get("max_bytes")
    return value if isinstance(value, int) and value > 0 else DEFAULT_AGENT_LOG_MAX_BYTES


class CamonApp(App[None]):  # type: ignore[misc]
    TITLE = "CAMON — Coding Agent Monitor"
    CSS = """
    Screen,
    TabbedContent,
    ContentSwitcher,
    TabPane {
        background: #071a33;
    }

    #overview_grid {
        layout: grid;
        grid-size: 2 2;
        grid-gutter: 1 2;
        padding: 1 2;
    }

    .overview_card {
        border: round $primary;
        padding: 1 2;
        height: 8;
    }

    .activity_chart {
        border: round $primary;
        padding: 1 2;
        margin: 1 2;
        height: 8;
    }

    .runtime_settings {
        border: round $primary;
        padding: 1 2;
        margin: 1 2;
        height: 5;
    }

    #runtime_table {
        margin: 0 2 1 2;
        height: 1fr;
    }

    #agent_logging_controls {
        height: 3;
        margin: 0 2 1 2;
    }

    #agent_log_dir {
        width: 1fr;
    }

    #agent_logging_help {
        margin: 1 2 0 2;
    }

    DataTable {
        background: $surface;
    }

    DataTable > .datatable--header {
        background: $primary;
        color: $text;
        text-style: bold;
    }

    DataTable > .datatable--even-row {
        background: $surface-darken-1;
    }

    DataTable > .datatable--cursor {
        background: $accent;
        color: $text;
        text-style: bold;
    }
    """
    BINDINGS = [
        ("1", "show_overview", "Overview"),
        ("2", "show_setup", "Setup"),
        ("3", "show_agents", "Agents"),
        ("4", "show_sessions", "Sessions"),
        ("5", "show_requests", "Requests"),
        ("6", "show_providers", "Providers"),
        ("7", "show_runtime", "Runtime"),
        ("e", "enable_proxy", "Enable selected agent"),
        ("l", "toggle_agent_logging", "Toggle agent logging"),
        ("q", "quit", "Quit"),
    ]

    def __init__(self, config: AppConfig | None = None) -> None:
        super().__init__()
        self.config = config or AppConfig.load()
        self.storage = Storage(self.config.database_path, self.config.retention_days)
        self.agent_setups: list[AgentSetup] = []
        self.agent_rows: list[dict[str, object]] = []

    def compose(self) -> ComposeResult:
        yield Header()
        with TabbedContent(initial="overview"):
            with TabPane("Overview", id="overview"):
                with Container(id="overview_grid"):
                    yield Static(id="overview_proxy", classes="overview_card")
                    yield Static(id="overview_monitoring", classes="overview_card")
                    yield Static(id="overview_storage", classes="overview_card")
                    yield Static(id="overview_activity", classes="overview_card")
                yield Static(id="activity_chart", classes="activity_chart")
            with TabPane("Setup", id="setup"):
                yield Static("Select an agent and press [b]e[/b] to configure its opt-in proxy routing.", id="setup_help")
                yield DataTable(id="setup_table")
            for name in ("Agents", "Sessions", "Requests", "Providers", "Runtime"):
                with TabPane(name, id=name.lower()):
                    if name == "Agents":
                        yield Static(
                            "Select an agent, then use [b]l[/b] or the button to toggle metadata traffic logging. "
                            "Logs rotate at 10 MiB and never include prompts, bodies, or credentials.",
                            id="agent_logging_help",
                        )
                        with Horizontal(id="agent_logging_controls"):
                            yield Input(value=str(DEFAULT_AGENT_LOG_DIR), placeholder="Absolute log directory", id="agent_log_dir")
                            yield Button("Save log directory", id="save_agent_log_dir")
                            yield Button("Toggle logging", id="toggle_agent_logging")
                    if name == "Sessions":
                        yield Static("Reported session IDs are shown when available; otherwise CAMON groups activity into 30-minute windows.")
                    if name == "Runtime":
                        yield Static(self._runtime_settings_text(), id="runtime_settings", classes="runtime_settings")
                    yield DataTable(id=f"{name.lower()}_table")
        yield Footer()

    def on_mount(self) -> None:
        self._apply_background_color()
        self.set_interval(self.config.refresh_seconds, self.refresh_data)
        self.refresh_data()

    def _apply_background_color(self) -> None:
        """Apply the configured background to the dashboard and all tab panes."""
        color = self.config.background_color
        self.screen.styles.background = color
        self.query_one(TabbedContent).styles.background = color
        for pane in self.query(TabPane):
            pane.styles.background = color

    def _runtime_settings_text(self) -> str:
        """Return settings content available before the first refresh completes."""
        return (
            "[b]Settings[/b]\n"
            f"Retention window  {self.config.retention_days} days\n"
            f"Background colour  {self.config.background_color}"
        )

    def refresh_data(self) -> None:
        proxy = detect_mitmproxy()
        health = "healthy" if self.storage.addon_healthy() else "not reporting"
        stats = self.storage.overview_stats()
        activity = self.storage.activity_series()
        pids = ", ".join(map(str, proxy.pids)) or "none"
        self.query_one("#overview_proxy", Static).update(
            "[b]Proxy[/b]\n"
            f"Status     {'running' if proxy.running else 'not detected'}\n"
            f"Endpoint   {self.config.proxy_url}\n"
            f"Uptime     {_format_uptime(proxy.started_at)}\n"
            f"PIDs       {pids}"
        )
        self.query_one("#overview_monitoring", Static).update(
            "[b]Monitoring[/b]\n"
            f"Addon      {health}\n"
            f"Retention  {stats['retention_days']} days\n"
            f"Last prune {_format_timestamp(stats['last_pruned_at'])}\n"
            f"Removed    {stats['last_pruned_records']} records"
        )
        self.query_one("#overview_storage", Static).update(
            "[b]Storage[/b]\n"
            f"Database   {_display_path(self.config.database_path)}\n"
            f"Footprint  {_format_bytes(stats['database_bytes'])}\n"
            "Includes SQLite WAL and shared-memory files"
        )
        self.query_one("#overview_activity", Static).update(
            "[b]Activity[/b]\n"
            f"Requests   {stats['request_count']}\n"
            f"Sessions   {stats['session_count']}\n"
            f"Agents     {stats['agent_count']} | Providers {stats['provider_count']}\n"
            f"Last seen  {_format_timestamp(stats['last_request_at'])}"
        )
        request_values = [int(item["request_count"]) for item in activity]
        token_values = [int(item["token_count"]) for item in activity]
        self.query_one("#activity_chart", Static).update(
            "[b]Activity — last 14 days[/b]\n"
            f"Requests  {_sparkline(request_values)}  {sum(request_values):,}\n"
            f"Tokens    {_sparkline(token_values)}  {_format_token_count(sum(token_values))}\n"
            f"{activity[0]['day']}  {' ' * 20}  {activity[-1]['day']}\n"
            "Each symbol represents one calendar day; token totals include reported and estimated values."
        )
        self._fill("sessions_table", self.storage.sessions(), ("session_key", "agent", "request_count", "last_seen_at", "source"))
        self._fill("requests_table", self.storage.recent_requests(), ("timestamp", "agent", "provider", "model", "status_code"))
        self._fill("providers_table", self.storage.provider_summary(), ("provider", "model", "request_count", "input_tokens", "output_tokens"))
        runtime: dict[str, object] = {
            "mitmproxy": str(proxy.running),
            "pids": ", ".join(map(str, proxy.pids)),
            "addon": health,
        }
        self.query_one("#runtime_settings", Static).update(self._runtime_settings_text())
        self._fill("runtime_table", [runtime], ("mitmproxy", "pids", "addon"))
        self._refresh_setup()
        self._refresh_agents()

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

    def _refresh_agents(self, force: bool = False) -> None:
        """Combine observed, detected, and configured agents into one logging view."""
        table = self.query_one("#agents_table", DataTable)
        if table.has_focus and not force:
            return
        selected_agent = (
            str(self.agent_rows[table.cursor_row]["agent"])
            if 0 <= table.cursor_row < len(self.agent_rows)
            else None
        )
        settings = self.storage.agent_logging_settings()
        observed: dict[str, int] = {}
        for item in self.storage.summary():
            agent = str(item["agent"])
            observed[agent] = observed.get(agent, 0) + int(item["request_count"] or 0)
        names = set(observed) | {item.agent for item in self.agent_setups} | set(settings)
        self.agent_rows = []
        for agent in sorted(names):
            setting = settings.get(agent, {})
            enabled = bool(setting.get("enabled", False))
            self.agent_rows.append(
                {
                    "agent": agent,
                    "request_count": observed.get(agent, 0),
                    "logging": "on" if enabled else "off",
                    "log_dir": str(setting.get("log_dir", DEFAULT_AGENT_LOG_DIR)),
                    "rotation": _format_bytes(_setting_max_bytes(setting)),
                }
            )
        self._fill("agents_table", self.agent_rows, ("agent", "request_count", "logging", "log_dir", "rotation"))
        if selected_agent is not None:
            restored_row = next(
                (index for index, item in enumerate(self.agent_rows) if item["agent"] == selected_agent), None
            )
            if restored_row is not None:
                table.move_cursor(row=restored_row, animate=False, scroll=False)

    def on_tabbed_content_tab_activated(self, event: TabbedContent.TabActivated) -> None:
        """Make the Setup table immediately keyboard-navigable on opening its tab."""
        if event.pane.id in {"setup", "agents"}:
            self.call_after_refresh(self.query_one(f"#{event.pane.id}_table", DataTable).focus)

    def on_data_table_row_highlighted(self, event: DataTable.RowHighlighted) -> None:
        """Show the selected agent's existing log directory in the editor."""
        self._sync_agent_log_dir(event.data_table, event.cursor_row)

    def on_data_table_cell_highlighted(self, event: DataTable.CellHighlighted) -> None:
        """DataTable emits cell highlighting for keyboard cursor movement."""
        self._sync_agent_log_dir(event.data_table, event.coordinate.row)

    def _sync_agent_log_dir(self, table: DataTable, row: int) -> None:
        if table.id != "agents_table" or not 0 <= row < len(self.agent_rows):
            return
        self.query_one("#agent_log_dir", Input).value = str(self.agent_rows[row]["log_dir"])

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

    def _selected_agent_for_logging(self) -> str | None:
        table = self.query_one("#agents_table", DataTable)
        if not 0 <= table.cursor_row < len(self.agent_rows):
            self.notify("Select an agent in the Agents tab first.", severity="warning")
            return None
        return str(self.agent_rows[table.cursor_row]["agent"])

    def action_toggle_agent_logging(self) -> None:
        agent = self._selected_agent_for_logging()
        if agent is None:
            return
        settings = self.storage.agent_logging_settings().get(agent, {})
        try:
            self.storage.configure_agent_logging(
                agent,
                not bool(settings.get("enabled", False)),
                str(settings.get("log_dir", self.query_one("#agent_log_dir", Input).value or DEFAULT_AGENT_LOG_DIR)),
                _setting_max_bytes(settings),
            )
        except (OSError, ValueError) as error:
            self.notify(str(error), severity="error")
            return
        self._refresh_agents(force=True)
        state = "enabled" if not bool(settings.get("enabled", False)) else "disabled"
        self.notify(f"Traffic logging {state} for {agent}.")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "toggle_agent_logging":
            self.action_toggle_agent_logging()
            return
        if event.button.id != "save_agent_log_dir":
            return
        agent = self._selected_agent_for_logging()
        if agent is None:
            return
        settings = self.storage.agent_logging_settings().get(agent, {})
        try:
            self.storage.configure_agent_logging(
                agent,
                bool(settings.get("enabled", False)),
                self.query_one("#agent_log_dir", Input).value,
                _setting_max_bytes(settings),
            )
        except (OSError, ValueError) as error:
            self.notify(str(error), severity="error")
            return
        self._refresh_agents(force=True)
        self.notify(f"Saved log directory for {agent}.")

    def _fill(self, table_id: str, rows: list[dict[str, object]], columns: tuple[str, ...]) -> None:
        table = self.query_one(f"#{table_id}", DataTable)
        table.clear(columns=True)
        table.zebra_stripes = True
        table.add_columns(*((_table_header(column), column) for column in columns))
        for row in rows:
            table.add_row(*(_table_cell(column, row.get(column, "")) for column in columns))
