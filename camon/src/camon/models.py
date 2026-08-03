"""Normalized, payload-free domain models."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field


class Attribution(BaseModel):
    agent: str = "unknown"
    pid: int | None = None
    process_name: str | None = None
    source: Literal["socket", "process", "command", "parent", "http", "unknown"] = "unknown"
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class UsageEvent(BaseModel):
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    method: str
    host: str
    path: str
    status_code: int | None = None
    provider: str = "unknown"
    model: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    estimated_tokens: bool = False
    duration_ms: float | None = None
    session_key: str | None = None
    attribution: Attribution = Field(default_factory=Attribution)


class AddonStatus(BaseModel):
    instance_id: str
    seen_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    version: str = "0.1.0"
    pid: int | None = None

