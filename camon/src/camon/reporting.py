"""Human and machine-readable report exporters."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Literal

from .storage import Storage


def render_report(storage: Storage, days: int = 30) -> str:
    rows = storage.summary(days)
    heading = f"CAMON usage, last {days} days"
    if not rows:
        return f"{heading}\nNo recorded requests."
    lines = [heading, "agent\tprovider\tmodel\trequests\tinput\toutput"]
    lines.extend(
        f"{row['agent']}\t{row['provider']}\t{row['model'] or '-'}\t{row['request_count']}\t"
        f"{row['input_tokens']}\t{row['output_tokens']}" for row in rows
    )
    return "\n".join(lines)


def export(storage: Storage, target: Path, format: Literal["json", "csv"], days: int = 30) -> int:
    rows = storage.summary(days)
    target.parent.mkdir(parents=True, exist_ok=True)
    if format == "json":
        target.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
    else:
        fields = ["agent", "provider", "model", "input_tokens", "output_tokens", "request_count"]
        with target.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
    return len(rows)
