#!/usr/bin/env bash
# Offline validation; does not install software, trust certificates, or manage services.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for script in "$ROOT"/*.sh "$ROOT"/lib/*.sh; do
  bash -n "$script"
done
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck "$ROOT"/*.sh "$ROOT"/lib/*.sh "$ROOT"/tests/validate.sh
fi

temporary_home="$(mktemp -d "${TMPDIR:-/tmp}/mitmproxy-linux-bootstrap-test.XXXXXX")"
cleanup() { rm -rf "$temporary_home"; }
trap cleanup EXIT HUP INT TERM
export HOME="$temporary_home"
export XDG_CONFIG_HOME="$temporary_home/config"
export XDG_DATA_HOME="$temporary_home/data"
# shellcheck source=../lib/common.sh
source "$ROOT/lib/common.sh"

for bad_port in 0 65536 invalid; do
  if (validate_port "$bad_port") >/dev/null 2>&1; then
    printf 'invalid port accepted: %s\n' "$bad_port" >&2
    exit 1
  fi
done
validate_port 8080
if missing_output="$( (resolve_mitmdump() { return 1; }; ensure_mitmdump true) 2>&1)"; then
  printf 'missing mitmdump was incorrectly accepted with --skip-install\n' >&2
  exit 1
fi
grep -Fq 'Install mitmproxy yourself' <<< "$missing_output"
ensure_directories
write_config 8080 0
write_config 8080 0
[[ -z "$(find "$BACKUP_DIR" -type f -print -quit)" ]]
write_config 8181 0
[[ -n "$(find "$BACKUP_DIR" -type f -name 'config.env.backup-*' -print -quit)" ]]
load_config
[[ "$MITMPROXY_PORT" == "8181" ]]
MITMDUMP_BIN="/tmp/mitmdump with spaces"
rendered="$temporary_home/$SERVICE_NAME"
render_service "$rendered"
grep -Fq 'ExecStart="/tmp/mitmdump with spaces" --listen-host 127.0.0.1 --listen-port 8181' "$rendered"
grep -Fq 'EnvironmentFile="'"$CONFIG_PATH"'"' "$rendered"
if command -v systemd-analyze >/dev/null 2>&1; then
  systemd-analyze --user verify "$rendered" >/dev/null || true
fi
printf 'Linux bootstrap validation passed.\n'
