"""Explicit, per-agent proxy launcher setup for the TUI."""

from __future__ import annotations

import json
import shlex
import shutil
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

import psutil

from .attribution import classify_text

AGENT_COMMANDS: dict[str, tuple[str, ...]] = {
    "claude-code": ("claude",),
    "codex-cli": ("codex",),
    "cursor": ("cursor", "Cursor"),
    "continue": ("continue",),
    "cline": ("cline",),
    "roo-code": ("roo",),
    "aider": ("aider",),
}

# GUI applications normally do not put their command-line launchers on PATH.
# Keep this deliberately small: these are app bundles that CAMON can launch
# directly with the opt-in proxy environment, rather than guessing from every
# application installed on the system.
MACOS_APPLICATIONS: dict[str, tuple[tuple[str, str], ...]] = {
    "cursor": (("Cursor.app", "Cursor"),),
}


@dataclass(frozen=True)
class AgentSetup:
    agent: str
    executable: str | None
    detected: bool
    routed: bool
    setup_ready: bool

    @property
    def status(self) -> str:
        if self.routed:
            return "routed"
        if self.setup_ready:
            return "settings ready" if self.agent == "claude-code" else "launcher ready"
        return "not configured"

    @property
    def setup_method(self) -> str:
        return "settings.json" if self.agent == "claude-code" else "launcher"


def launcher_directory() -> Path:
    return Path.home() / ".insrc" / "camon" / "bin"


def launcher_path(agent: str, directory: Path | None = None) -> Path:
    return (directory or launcher_directory()) / f"camon-{agent}"


def claude_settings_path() -> Path:
    return Path.home() / ".claude" / "settings.json"


def mitmproxy_ca_cert_path() -> Path:
    return Path.home() / ".mitmproxy" / "mitmproxy-ca-cert.pem"


def _is_routed(environment: dict[str, str], proxy_url: str) -> bool:
    return environment.get("HTTP_PROXY") == proxy_url or environment.get("HTTPS_PROXY") == proxy_url


def _macos_application_executable(agent: str, roots: tuple[Path, ...] | None = None) -> str | None:
    """Return an executable inside a known macOS app bundle, if installed."""
    if sys.platform != "darwin":
        return None
    application_roots = roots or (Path("/Applications"), Path.home() / "Applications")
    for bundle_name, executable_name in MACOS_APPLICATIONS.get(agent, ()):
        for root in application_roots:
            executable = root / bundle_name / "Contents" / "MacOS" / executable_name
            if executable.is_file():
                return str(executable)
    return None


def _find_executable(agent: str) -> str | None:
    """Locate a CLI executable or a supported installed app."""
    command = next((found for name in AGENT_COMMANDS[agent] if (found := shutil.which(name))), None)
    return command or _macos_application_executable(agent)


def _process_executable(agent: str, command_line: list[str]) -> str | None:
    """Return an agent executable from a process command line, never its shell."""
    command_names = set(AGENT_COMMANDS[agent])
    return next((argument for argument in command_line if Path(argument).name in command_names), None)


def _claude_settings_configured(path: Path, proxy_url: str) -> bool:
    try:
        values = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    environment = values.get("env") if isinstance(values, dict) else None
    return (
        isinstance(environment, dict)
        and environment.get("HTTP_PROXY") == proxy_url
        and environment.get("HTTPS_PROXY") == proxy_url
        and environment.get("NODE_EXTRA_CA_CERTS") == str(mitmproxy_ca_cert_path())
    )


def _write_claude_settings(path: Path, proxy_url: str, certificate_path: Path | None = None) -> None:
    """Merge CAMON proxy variables into a valid Claude Code user settings file."""
    certificate = certificate_path or mitmproxy_ca_cert_path()
    if not certificate.is_file():
        raise FileNotFoundError(f"The mitmproxy CA certificate was not found: {certificate}")
    values: dict[str, object] = {}
    if path.exists():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise ValueError(f"Claude Code settings are not valid JSON: {path}") from error
        if not isinstance(loaded, dict):
            raise ValueError(f"Claude Code settings must contain a JSON object: {path}")
        values = loaded
    environment = values.setdefault("env", {})
    if not isinstance(environment, dict):
        raise ValueError(f"Claude Code settings env must be a JSON object: {path}")
    environment.update(
        {
            "HTTP_PROXY": proxy_url,
            "HTTPS_PROXY": proxy_url,
            "ALL_PROXY": proxy_url,
            "NO_PROXY": "localhost,127.0.0.1,::1",
            "NODE_EXTRA_CA_CERTS": str(certificate),
        }
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(values, handle, indent=2)
        handle.write("\n")
        temporary_path = Path(handle.name)
    try:
        temporary_path.replace(path)
    finally:
        temporary_path.unlink(missing_ok=True)


def _setup_ready(agent: str, proxy_url: str) -> bool:
    if agent == "claude-code":
        return _claude_settings_configured(claude_settings_path(), proxy_url)
    return launcher_path(agent).exists()


def detect_agents(proxy_url: str) -> list[AgentSetup]:
    discovered: dict[str, tuple[str | None, bool]] = {}
    try:
        for process in psutil.process_iter(["name", "cmdline"]):
            try:
                command_parts = process.info.get("cmdline") or []
                command_line = " ".join(command_parts)
                agent = classify_text(f"{process.info.get('name') or ''} {command_line}")
                if agent and agent in AGENT_COMMANDS:
                    executable = _process_executable(agent, command_parts)
                    environment = process.environ()
                    discovered[agent] = (executable, _is_routed(environment, proxy_url))
            except (psutil.AccessDenied, psutil.NoSuchProcess, OSError):
                continue
    except (psutil.AccessDenied, OSError):
        pass

    setups: list[AgentSetup] = []
    for agent in AGENT_COMMANDS:
        executable, routed = discovered.get(agent, (None, False))
        resolved = _find_executable(agent) or executable
        ready = _setup_ready(agent, proxy_url)
        if executable or resolved or ready:
            setups.append(AgentSetup(agent, resolved, agent in discovered or resolved is not None, routed, ready))
    return sorted(setups, key=lambda item: item.agent)


def setup_agent(agent: str, proxy_url: str, executable: str | None = None, directory: Path | None = None) -> Path:
    """Configure one detected agent to use CAMON's local proxy."""
    if agent not in AGENT_COMMANDS:
        raise ValueError(f"Unsupported agent: {agent}")
    if agent == "claude-code":
        target = claude_settings_path()
        _write_claude_settings(target, proxy_url)
        return target
    resolved = executable or _find_executable(agent)
    if not resolved:
        raise FileNotFoundError(f"No executable was found for {agent}; start or install it first.")
    target = launcher_path(agent, directory)
    target.parent.mkdir(parents=True, exist_ok=True)
    quoted_proxy = shlex.quote(proxy_url)
    quoted_executable = shlex.quote(resolved)
    target.write_text(
        "#!/usr/bin/env bash\n"
        f"export HTTP_PROXY={quoted_proxy}\n"
        f"export HTTPS_PROXY={quoted_proxy}\n"
        f"export ALL_PROXY={quoted_proxy}\n"
        "export NO_PROXY=localhost,127.0.0.1,::1\n"
        f"exec {quoted_executable} \"$@\"\n",
        encoding="utf-8",
    )
    target.chmod(0o755)
    return target
