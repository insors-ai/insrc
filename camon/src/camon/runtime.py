"""Conservative interaction with an existing mitmproxy process."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path

import psutil

from .config import AppConfig


@dataclass(frozen=True)
class ProxyState:
    running: bool
    pids: tuple[int, ...] = ()


def detect_mitmproxy() -> ProxyState:
    pids: list[int] = []
    try:
        for process in psutil.process_iter(["pid", "name", "cmdline"]):
            try:
                text = " ".join([process.info.get("name") or "", *(process.info.get("cmdline") or [])]).lower()
                if "mitmproxy" in text or "mitmdump" in text or "mitmweb" in text:
                    pids.append(process.pid)
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                continue
    except (psutil.AccessDenied, OSError, PermissionError):
        # Sandboxed or restricted environments may not permit process enumeration.
        return ProxyState(False)
    return ProxyState(bool(pids), tuple(pids))


def restart_managed(config: AppConfig) -> subprocess.Popen[str]:
    """Restart only a process explicitly designated as CAMON-managed."""
    if not config.managed_mitmproxy:
        raise PermissionError("Refusing to restart unmanaged mitmproxy; set managed_mitmproxy = true.")
    if not config.mitmproxy_command:
        raise ValueError("managed_mitmproxy requires mitmproxy_command")
    pid_path = config.managed_pid_path or config.database_path.with_name("managed-mitmproxy.pid")
    if pid_path.exists():
        try:
            pid = int(pid_path.read_text(encoding="utf-8").strip())
            psutil.Process(pid).terminate()
        except (ValueError, psutil.AccessDenied, psutil.NoSuchProcess):
            pass
        pid_path.unlink(missing_ok=True)
    process = subprocess.Popen(config.mitmproxy_command, text=True)  # noqa: S603
    pid_path.parent.mkdir(parents=True, exist_ok=True)
    pid_path.write_text(str(process.pid), encoding="utf-8")
    return process


def addon_manifest(config: AppConfig) -> str:
    addon_path = Path(__file__).with_name("addon.py")
    return f"# Add this to your existing mitmproxy command\n-s {addon_path}\n"
