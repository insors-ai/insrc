"""Provider, model and token extraction without retaining payloads."""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlparse


def provider_for_host(host: str) -> str:
    host = host.lower()
    if "openai" in host:
        return "openai"
    if "anthropic" in host:
        return "anthropic"
    if "google" in host or "generativelanguage" in host:
        return "google"
    if "mistral" in host:
        return "mistral"
    if "x.ai" in host:
        return "xai"
    return host.split(".")[-2] if "." in host else "unknown"


def _integer(value: Any) -> int:
    return value if isinstance(value, int) and value >= 0 else 0


def estimate_tokens(body: bytes | None) -> int:
    """Conservative character-based estimate used only when a provider omits usage."""
    return max(0, len(body or b"") // 4)


def usage_from_json(body: bytes | None) -> tuple[str | None, int, int] | None:
    if not body:
        return None
    try:
        document = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(document, dict):
        return None
    usage = document.get("usage") or document.get("usageMetadata")
    if not isinstance(usage, dict):
        return None
    model = document.get("model") if isinstance(document.get("model"), str) else None
    input_tokens = _integer(usage.get("input_tokens", usage.get("prompt_tokens", usage.get("promptTokenCount", 0))))
    output_tokens = _integer(usage.get("output_tokens", usage.get("completion_tokens", usage.get("candidatesTokenCount", 0))))
    return model, input_tokens, output_tokens


def safe_url_parts(url: str) -> tuple[str, str]:
    parsed = urlparse(url)
    return parsed.hostname or "unknown", parsed.path or "/"
