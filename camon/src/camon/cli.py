"""CAMON command line interface."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer

from .config import AppConfig
from .registration import register_local_addon
from .reporting import export as export_report
from .reporting import render_report
from .runtime import detect_mitmproxy, restart_managed
from .storage import Storage

app = typer.Typer(help="Passive coding-agent usage monitor.", no_args_is_help=False)


def _services() -> tuple[AppConfig, Storage]:
    config = AppConfig.load()
    return config, Storage(config.database_path, config.retention_days)


@app.callback(invoke_without_command=True)
def main(ctx: typer.Context) -> None:
    """Launch the live dashboard when invoked without a subcommand."""
    if ctx.invoked_subcommand is None:
        from .tui import CamonApp

        CamonApp().run()


@app.command()
def status() -> None:
    """Show proxy detection and addon heartbeat state."""
    _, storage = _services()
    proxy = detect_mitmproxy()
    typer.echo(f"mitmproxy: {'running' if proxy.running else 'not detected'}")
    typer.echo(f"addon heartbeat: {'healthy' if storage.addon_healthy() else 'not reporting'}")
    if proxy.pids:
        typer.echo("pids: " + ", ".join(map(str, proxy.pids)))


@app.command()
def register() -> None:
    """Register the addon with the known local bootstrap service."""
    try:
        typer.echo(register_local_addon(AppConfig.load().retention_days))
    except (FileNotFoundError, RuntimeError, ValueError) as error:
        typer.echo(str(error), err=True)
        raise typer.Exit(code=1) from error


@app.command()
def restart() -> None:
    """Restart mitmproxy only when configured as managed."""
    config, _ = _services()
    try:
        process = restart_managed(config)
    except (PermissionError, ValueError) as error:
        typer.echo(str(error), err=True)
        raise typer.Exit(code=1) from error
    typer.echo(f"Started managed mitmproxy with PID {process.pid}")


@app.command()
def report(days: Annotated[int, typer.Option(min=1)] = 30) -> None:
    """Print an aggregate usage report."""
    _, storage = _services()
    typer.echo(render_report(storage, days))


@app.command()
def export(
    target: Path,
    format: Annotated[str, typer.Option("--format", "-f")] = "json",
    days: Annotated[int, typer.Option(min=1)] = 30,
) -> None:
    """Export aggregate usage to CSV or JSON."""
    if format not in {"json", "csv"}:
        raise typer.BadParameter("format must be json or csv")
    _, storage = _services()
    count = export_report(storage, target, format, days)  # type: ignore[arg-type]
    typer.echo(f"Exported {count} usage rows to {target}")
