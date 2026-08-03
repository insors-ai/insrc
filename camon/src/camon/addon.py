"""mitmproxy entry point for CAMON's dependency-free addon runtime."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .addon_runtime import CamonAddon
elif __package__ and __package__.startswith("camon"):
    from .addon_runtime import CamonAddon
else:  # mitmproxy executes ``-s`` scripts with a synthetic package name.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from addon_runtime import CamonAddon  # type: ignore[import-not-found, no-redef]

addons = [CamonAddon()]
