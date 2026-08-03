#!/usr/bin/env bash
# Static checks for the user-level CAMON TUI installer.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bash -n "$ROOT/install.sh"
"$ROOT/install.sh" --help >/dev/null
grep -Fq 'mitmdump was not detected' "$ROOT/install.sh"
grep -Fq 'Run the $platform local mitmproxy setup now?' "$ROOT/install.sh"
grep -Fq 'export PATH="$HOME/.insrc/camon/bin:$PATH"' "$ROOT/install.sh"
grep -Fq 'export CAMON_DATABASE=' "$ROOT/install.sh"
grep -Fq 'export CAMON_RETENTION_DAYS=7' "$ROOT/install.sh"
grep -Fq '"$SOURCE_ROOT[proxy]"' "$ROOT/install.sh"
grep -Fq '"$BIN_PATH/camon" register' "$ROOT/install.sh"
printf 'TUI installer validation passed.\n'
