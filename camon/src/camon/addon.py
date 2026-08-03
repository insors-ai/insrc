"""mitmproxy addon.  It observes completed flows and makes no flow mutations."""

from __future__ import annotations

import os
import time
import uuid
from typing import Any

from .attribution import ProcessAttributor
from .config import AppConfig
from .extract import estimate_tokens, provider_for_host, safe_url_parts, usage_from_json
from .models import AddonStatus, UsageEvent
from .storage import Storage


class CamonAddon:
    def __init__(self, config: AppConfig | None = None) -> None:
        self.config = config or AppConfig.load()
        self._storage: Storage | None = None
        self.attributor = ProcessAttributor(self.config.agent_rules)
        self.instance_id = str(uuid.uuid4())
        self._last_heartbeat = 0.0

    @property
    def storage(self) -> Storage:
        """Open the database only once mitmproxy actually runs the addon."""
        if self._storage is None:
            self._storage = Storage(self.config.database_path)
        return self._storage

    def running(self) -> None:
        self._heartbeat()

    def response(self, flow: Any) -> None:
        """Record metadata from a completed flow. Never assigns to ``flow``."""
        self._heartbeat()
        request = flow.request
        response = flow.response
        host, path = safe_url_parts(request.pretty_url)
        user_agent = request.headers.get("user-agent", "")
        peer = getattr(flow, "client_conn", None)
        attribution = self.attributor.for_connection(
            getattr(peer, "peername", ("", 0))[0] or "", getattr(peer, "peername", ("", 0))[1] or 0, user_agent
        )
        response_content = getattr(response, "content", None)
        extracted = usage_from_json(response_content)
        if extracted:
            model, input_tokens, output_tokens = extracted
            estimated = False
        else:
            model = None
            input_tokens = estimate_tokens(getattr(request, "content", None))
            output_tokens = estimate_tokens(response_content)
            estimated = True
        started = getattr(request, "timestamp_start", None)
        ended = getattr(response, "timestamp_end", None)
        duration = (ended - started) * 1000 if isinstance(started, (int, float)) and isinstance(ended, (int, float)) else None
        session_key = (
            request.headers.get("x-session-id")
            or request.headers.get("openai-conversation-id")
            or request.headers.get("anthropic-conversation-id")
        )
        self.storage.record(UsageEvent(
            method=request.method, host=host, path=path, status_code=response.status_code,
            provider=provider_for_host(host), model=model, input_tokens=input_tokens,
            output_tokens=output_tokens, estimated_tokens=estimated, duration_ms=duration,
            session_key=session_key, attribution=attribution,
        ))

    def _heartbeat(self) -> None:
        now = time.monotonic()
        if now - self._last_heartbeat >= 2:
            self.storage.heartbeat(AddonStatus(instance_id=self.instance_id, pid=os.getpid()))
            self._last_heartbeat = now


addons = [CamonAddon()]
