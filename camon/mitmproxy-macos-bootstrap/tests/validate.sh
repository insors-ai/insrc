#!/usr/bin/env bash
# Offline validation for project syntax, port checking, and plist rendering.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for script in "$ROOT"/*.sh "$ROOT"/lib/*.sh; do
  bash -n "$script"
done
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck "$ROOT"/*.sh "$ROOT"/lib/*.sh "$ROOT"/tests/validate.sh
fi

temporary_home="$(mktemp -d "${TMPDIR:-/tmp}/mitmproxy-bootstrap-test.XXXXXX")"
cleanup() { rm -rf "$temporary_home"; }
trap cleanup EXIT HUP INT TERM
export HOME="$temporary_home"
# shellcheck source=../lib/common.sh
source "$ROOT/lib/common.sh"

for bad_port in 0 65536 abc; do
  if (validate_port "$bad_port") >/dev/null 2>&1; then
    printf 'invalid port accepted: %s\n' "$bad_port" >&2
    exit 1
  fi
done
validate_port 8080
if missing_output="$( (resolve_mitmdump() { return 1; }; ensure_mitmdump) 2>&1)"; then
  printf 'missing mitmdump was incorrectly accepted\n' >&2
  exit 1
fi
grep -Fq 'brew install mitmproxy' <<< "$missing_output"
ensure_directories
write_config 8080
write_config 8080
[[ -z "$(find "$BACKUP_DIR" -type f -print -quit)" ]]
write_config 8181
[[ -n "$(find "$BACKUP_DIR" -type f -name 'config.env.backup-*' -print -quit)" ]]
load_config
[[ "$MITMPROXY_PORT" == "8181" ]]
MITMDUMP_BIN="/tmp/mitmdump with spaces"
rendered="$temporary_home/local.mitmproxy.plist"
render_plist "$rendered"
plutil -lint "$rendered" >/dev/null
grep -Fq '<string>/tmp/mitmdump with spaces</string>' "$rendered"
grep -Fq '<string>127.0.0.1</string>' "$rendered"
grep -Fq '<string>8181</string>' "$rendered"
parsed_pid="$(printf '  pid = 48102\n' | awk '/^[[:space:]]*pid = [0-9]+([[:space:]]|$)/ { print $3; exit }')"
[[ "$parsed_pid" == "48102" ]]
printf 'Bootstrap validation passed.\n'
