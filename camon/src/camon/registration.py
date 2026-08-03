"""Explicit registration of CAMON's addon with the local bootstrap services."""

from __future__ import annotations

import os
import plistlib
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


def addon_path() -> Path:
    return Path(__file__).with_name("addon.py")


def _backup(path: Path, backup_dir: Path) -> None:
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    shutil.copy2(path, backup_dir / f"{path.name}.backup-{stamp}")


def addon_mitmdump() -> Path:
    """Return the mitmproxy executable installed beside CAMON's Python runtime."""
    candidate = Path(sys.executable).with_name("mitmdump")
    if not candidate.exists():
        raise RuntimeError(
            "CAMON's compatible mitmdump runtime is missing. Re-run CAMON's ./install.sh."
        )
    return candidate


def addon_database() -> Path:
    return Path.home() / ".insrc" / "camon" / "camon.sqlite3"


def _update_macos_program_arguments(document: dict[str, Any], addon: Path, mitmdump: Path, retention_days: int = 7) -> bool:
    if document.get("Label") != "local.mitmproxy":
        raise ValueError("Refusing to modify a LaunchAgent other than local.mitmproxy.")
    arguments = document.get("ProgramArguments")
    if not isinstance(arguments, list) or not all(isinstance(item, str) for item in arguments):
        raise ValueError("The LaunchAgent has invalid ProgramArguments.")
    if not arguments or "mitmdump" not in Path(arguments[0]).name:
        raise ValueError("The LaunchAgent is not a mitmdump service.")
    if "--listen-host" not in arguments or "127.0.0.1" not in arguments:
        raise ValueError("Refusing to register with a service not bound to 127.0.0.1.")
    has_addon = any(argument == "-s" and Path(arguments[index + 1]) == addon for index, argument in enumerate(arguments[:-1]))
    updated = [str(mitmdump), *arguments[1:]]
    if not has_addon:
        updated.extend(["-s", str(addon)])
    environment = document.setdefault("EnvironmentVariables", {})
    if not isinstance(environment, dict) or any(not isinstance(key, str) or not isinstance(value, str) for key, value in environment.items()):
        raise ValueError("The LaunchAgent has invalid environment variables.")
    database = str(addon_database())
    changed = (
        updated != arguments
        or environment.get("CAMON_DATABASE") != database
        or environment.get("CAMON_RETENTION_DAYS") != str(retention_days)
    )
    document["ProgramArguments"] = updated
    environment["CAMON_DATABASE"] = database
    environment["CAMON_RETENTION_DAYS"] = str(retention_days)
    return changed


def _register_macos(addon: Path, retention_days: int) -> str:
    plist = Path.home() / "Library" / "LaunchAgents" / "local.mitmproxy.plist"
    if not plist.exists():
        raise FileNotFoundError("No local.mitmproxy LaunchAgent exists; run the macOS bootstrap first.")
    original = plist.read_bytes()
    with plist.open("rb") as handle:
        document = plistlib.load(handle)
    if not isinstance(document, dict):
        raise ValueError("The LaunchAgent plist is not a dictionary.")
    if not _update_macos_program_arguments(document, addon, addon_mitmdump(), retention_days):
        target = f"gui/{os.getuid()}/local.mitmproxy"
        subprocess.run(["launchctl", "kickstart", "-k", target], check=True)
        return "CAMON addon was already registered; restarted local.mitmproxy."
    service_dir = Path.home() / "Library" / "Application Support" / "mitmproxy-local"
    _backup(plist, service_dir / "backups")
    staged = plist.with_suffix(".plist.camon-tmp")
    with staged.open("wb") as handle:
        plistlib.dump(document, handle, sort_keys=False)
    os.replace(staged, plist)
    target = f"gui/{os.getuid()}/local.mitmproxy"
    domain = f"gui/{os.getuid()}"
    unloaded = subprocess.run(["launchctl", "bootout", domain, str(plist)], check=False, capture_output=True, text=True)
    if unloaded.returncode != 0:
        # The target form is needed by some macOS releases when the plist path
        # has been replaced atomically.
        unloaded = subprocess.run(["launchctl", "bootout", target], check=False, capture_output=True, text=True)
    still_loaded = subprocess.run(["launchctl", "print", target], check=False, capture_output=True, text=True)
    if still_loaded.returncode == 0:
        details = (unloaded.stderr or unloaded.stdout).strip()
        raise RuntimeError(f"Could not unload local.mitmproxy before registration. {details}".strip())
    try:
        subprocess.run(["launchctl", "bootstrap", domain, str(plist)], check=True, capture_output=True, text=True)
        subprocess.run(["launchctl", "kickstart", "-k", target], check=True)
    except subprocess.CalledProcessError as error:
        plist.write_bytes(original)
        subprocess.run(["launchctl", "bootout", target], check=False, capture_output=True, text=True)
        subprocess.run(["launchctl", "bootstrap", domain, str(plist)], check=False, capture_output=True, text=True)
        details = (error.stderr or error.stdout or "").strip()
        raise RuntimeError(f"Could not restart local.mitmproxy; restored its previous configuration. {details}".strip()) from error
    return "Registered CAMON addon and restarted local.mitmproxy."


def _config_port(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("MITMPROXY_PORT="):
            port = line.split("=", 1)[1]
            if port.isdecimal() and 0 < int(port) <= 65535:
                return port
    raise ValueError("The local mitmproxy configuration has no valid port.")


def _register_linux(addon: Path, retention_days: int) -> str:
    config_home = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    data_home = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    service = config_home / "systemd" / "user" / "mitmproxy-local.service"
    config = config_home / "mitmproxy-local" / "config.env"
    if not service.exists() or not config.exists():
        raise FileNotFoundError("No local mitmproxy systemd service exists; run the Linux bootstrap first.")
    service_text = service.read_text(encoding="utf-8")
    if "--listen-host 127.0.0.1" not in service_text:
        raise ValueError("Refusing to register with a service not bound to 127.0.0.1.")
    mitmdump = addon_mitmdump()
    port = _config_port(config)
    drop_in = service.parent / "mitmproxy-local.service.d" / "camon-addon.conf"
    content = (
        "[Service]\nExecStart=\n"
        f'ExecStart="{mitmdump}" --listen-host 127.0.0.1 --listen-port {port} -s "{addon}"\n'
        f'Environment="CAMON_DATABASE={addon_database()}"\n'
        f'Environment="CAMON_RETENTION_DAYS={retention_days}"\n'
    )
    if drop_in.exists() and drop_in.read_text(encoding="utf-8") == content:
        subprocess.run(["systemctl", "--user", "restart", "mitmproxy-local.service"], check=True)
        return "CAMON addon was already registered; restarted mitmproxy-local.service."
    if drop_in.exists():
        _backup(drop_in, data_home / "mitmproxy-local" / "backups")
    drop_in.parent.mkdir(parents=True, exist_ok=True)
    drop_in.write_text(content, encoding="utf-8")
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "--user", "restart", "mitmproxy-local.service"], check=True)
    return "Registered CAMON addon and restarted mitmproxy-local.service."


def register_local_addon(retention_days: int = 7) -> str:
    """Attach the addon only to one of this repository's known local services."""
    addon = addon_path()
    if not addon.exists():
        raise FileNotFoundError(f"CAMON addon is missing: {addon}")
    if sys.platform == "darwin":
        return _register_macos(addon, retention_days)
    if sys.platform.startswith("linux"):
        return _register_linux(addon, retention_days)
    raise RuntimeError("Automatic addon registration is supported on macOS and Linux only.")
