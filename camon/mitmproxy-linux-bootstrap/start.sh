#!/usr/bin/env bash

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

require_linux
require_systemd_user
load_config
[[ -f "$SERVICE_PATH" ]] || die "Systemd user service not installed. Run ./install.sh first."
port_is_safe || die "Refusing to use a port owned by another process."
systemd_reload
if service_running && listener_active; then
  success "mitmdump already running at http://$MITMPROXY_HOST:$MITMPROXY_PORT"
  exit 0
fi
systemctl --user start "$SERVICE_NAME" || die "Could not start $SERVICE_NAME."
wait_for_listener || die "mitmdump did not start listening. Inspect $LOG_DIR/stderr.log"
success "mitmdump listening at http://$MITMPROXY_HOST:$MITMPROXY_PORT"
