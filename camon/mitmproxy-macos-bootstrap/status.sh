#!/usr/bin/env bash

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

require_macos
load_config

if resolve_mitmdump; then
  installed="yes"
  version="$($MITMDUMP_BIN --version 2>/dev/null | head -n 1 || true)"
else
  installed="no"
  version="-"
fi
ca="no"; ca_exists && ca="yes"
trusted="no"; certificate_trusted && trusted="yes"
plist="no"; [[ -f "$PLIST_PATH" ]] && plist="yes"
loaded="no"; service_loaded && loaded="yes"
pid="-"; service_pid_value="$(service_pid || true)"; [[ -n "$service_pid_value" ]] && pid="$service_pid_value"
listener="no"; listener_active && listener="yes"

printf 'mitmproxy installed: %s\nmitmdump: %s\nversion: %s\n' "$installed" "${MITMDUMP_BIN:--}" "$version"
printf 'CA generated: %s\nCA trusted: %s (best effort)\n' "$ca" "$trusted"
printf 'LaunchAgent installed: %s\nLaunchAgent loaded: %s\nPID: %s\n' "$plist" "$loaded" "$pid"
printf 'Proxy: http://%s:%s\nListener active: %s\n' "$MITMPROXY_HOST" "$MITMPROXY_PORT" "$listener"
printf 'stdout log: %s/stdout.log\nstderr log: %s/stderr.log\n' "$LOG_DIR" "$LOG_DIR"
