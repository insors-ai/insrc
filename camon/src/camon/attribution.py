"""Best-effort local process attribution; failures always degrade to unknown."""

from __future__ import annotations

import re
from collections.abc import Iterable

import psutil

from .config import AgentRule
from .models import Attribution

KNOWN_NAMES = {
    "claude": "claude-code", "codex": "codex-cli", "cursor": "cursor",
    "continue": "continue", "cline": "cline", "roo": "roo-code", "aider": "aider",
}


def classify_text(text: str, rules: Iterable[AgentRule] = ()) -> str | None:
    for rule in sorted((item for item in rules if item.enabled), key=lambda item: item.priority):
        if re.search(rule.pattern, text, re.IGNORECASE):
            return rule.name
    lowered = text.lower()
    for needle, agent in KNOWN_NAMES.items():
        if needle in lowered:
            return agent
    return None


class ProcessAttributor:
    def __init__(self, rules: Iterable[AgentRule] = ()) -> None:
        self.rules = list(rules)

    def for_connection(self, client_host: str, client_port: int, user_agent: str = "") -> Attribution:
        pid = self._pid_for_socket(client_host, client_port)
        if pid is not None:
            attributed = self._from_pid(pid)
            if attributed is not None:
                return attributed
        agent = classify_text(user_agent, self.rules)
        if agent:
            return Attribution(agent=agent, source="http", confidence=0.35)
        return Attribution()

    @staticmethod
    def _pid_for_socket(host: str, port: int) -> int | None:
        try:
            for connection in psutil.net_connections(kind="tcp"):
                if connection.laddr and connection.laddr.ip == host and connection.laddr.port == port:
                    return int(connection.pid) if connection.pid is not None else None
        except (psutil.AccessDenied, OSError):
            pass
        return None

    def _from_pid(self, pid: int) -> Attribution | None:
        try:
            process = psutil.Process(pid)
            name = process.name()
            command = " ".join(process.cmdline())
        except (psutil.AccessDenied, psutil.NoSuchProcess, OSError):
            return None
        agent = classify_text(name, self.rules)
        if agent:
            return Attribution(agent=agent, pid=pid, process_name=name, source="process", confidence=0.9)
        agent = classify_text(command, self.rules)
        if agent:
            return Attribution(agent=agent, pid=pid, process_name=name, source="command", confidence=0.8)
        try:
            for parent in process.parents():
                agent = classify_text(f"{parent.name()} {' '.join(parent.cmdline())}", self.rules)
                if agent:
                    return Attribution(agent=agent, pid=pid, process_name=name, source="parent", confidence=0.65)
        except (psutil.AccessDenied, psutil.NoSuchProcess, OSError):
            pass
        return Attribution(pid=pid, process_name=name, source="socket", confidence=0.15)
