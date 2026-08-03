#!/usr/bin/env bash

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

require_linux
require_systemd_user
load_config
if service_running; then
  systemctl --user stop "$SERVICE_NAME" || die "Could not stop $SERVICE_NAME."
  success "Local mitmproxy service stopped"
else
  success "Local mitmproxy service already stopped"
fi
