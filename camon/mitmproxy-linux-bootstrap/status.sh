#!/usr/bin/env bash

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

require_linux
load_config
if resolve_mitmdump; then
  installed="yes"
  version="$($MITMDUMP_BIN --version 2>/dev/null | head -n 1 || true)"
else
  installed="no"; version="-"
fi
ca="no"; ca_exists && ca="yes"
user_trust="no"; user_cert_trusted && user_trust="yes"
system_trust="no"; system_cert_present && system_trust="yes"
service_installed="no"; [[ -f "$SERVICE_PATH" ]] && service_installed="yes"
enabled="no"; command -v systemctl >/dev/null 2>&1 && service_enabled && enabled="yes"
running="no"; command -v systemctl >/dev/null 2>&1 && service_running && running="yes"
pid="-"; process_id="$(service_pid)"; [[ "$process_id" =~ ^[1-9][0-9]*$ ]] && pid="$process_id"
listener="no"; listener_active && listener="yes"

printf 'mitmproxy installed: %s\nmitmdump: %s\nversion: %s\n' "$installed" "${MITMDUMP_BIN:--}" "$version"
printf 'CA generated: %s\nUser trust configured: %s (best effort)\nSystem trust configured: %s\n' "$ca" "$user_trust" "$system_trust"
printf 'Service installed: %s\nService enabled: %s\nService running: %s\nPID: %s\n' "$service_installed" "$enabled" "$running" "$pid"
printf 'Proxy: http://%s:%s\nListener active: %s\n' "$MITMPROXY_HOST" "$MITMPROXY_PORT" "$listener"
printf 'stdout log: %s/stdout.log\nstderr log: %s/stderr.log\n' "$LOG_DIR" "$LOG_DIR"
