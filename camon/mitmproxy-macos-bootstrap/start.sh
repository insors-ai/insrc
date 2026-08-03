#!/usr/bin/env bash

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

require_macos
require_command launchctl
require_command lsof
load_config
[[ -f "$PLIST_PATH" ]] || die "LaunchAgent not installed. Run ./install.sh first."
port_is_safe || die "Refusing to use a port owned by another process."
if service_loaded; then
  if listener_active; then
    success "mitmdump already running at http://$MITMPROXY_HOST:$MITMPROXY_PORT"
    exit 0
  fi
  launchctl kickstart -k "$(service_target)" || die "Could not start $(service_target)."
else
  bootstrap_service
fi
wait_for_listener || die "mitmdump did not start listening. Inspect $LOG_DIR/stderr.log"
success "mitmdump listening at http://$MITMPROXY_HOST:$MITMPROXY_PORT"
