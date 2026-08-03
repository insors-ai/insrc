"""Configuration loading with safe local defaults."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


def default_data_dir() -> Path:
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "camon"
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "camon"


class AgentRule(BaseModel):
    name: str
    pattern: str
    priority: int = 100
    enabled: bool = True


class AppConfig(BaseModel):
    database_path: Path = Field(default_factory=lambda: default_data_dir() / "camon.sqlite3")
    managed_mitmproxy: bool = False
    mitmproxy_command: list[str] = Field(default_factory=list)
    managed_pid_path: Path | None = None
    refresh_seconds: float = 2.0
    retention_days: int = Field(default=7, ge=1)
    proxy_host: str = "127.0.0.1"
    proxy_port: int = Field(default=8080, ge=1, le=65535)
    agent_rules: list[AgentRule] = Field(default_factory=list)

    @property
    def proxy_url(self) -> str:
        return f"http://{self.proxy_host}:{self.proxy_port}"

    @classmethod
    def load(cls, path: Path | None = None) -> AppConfig:
        config_path = path or Path(os.environ.get("CAMON_CONFIG", default_data_dir() / "config.toml"))
        values: dict[str, Any] = {}
        if config_path.exists():
            import tomllib

            with config_path.open("rb") as handle:
                values = tomllib.load(handle)
        database = os.environ.get("CAMON_DATABASE")
        if database:
            values["database_path"] = database
        return cls.model_validate(values)
