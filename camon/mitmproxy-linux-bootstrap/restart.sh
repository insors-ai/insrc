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
if service_running; then
  systemctl --user restart "$SERVICE_NAME" || die "Could not restart $SERVICE_NAME."
else
  systemctl --user start "$SERVICE_NAME" || die "Could not start $SERVICE_NAME."
fi
wait_for_listener || die "mitmdump did not restart. Inspect $LOG_DIR/stderr.log"
success "mitmdump listening at http://$MITMPROXY_HOST:$MITMPROXY_PORT"
