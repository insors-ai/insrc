#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

port="8080"
while (( $# > 0 )); do
  case "$1" in
    --port)
      (( $# >= 2 )) || die "--port requires a value."
      port="$2"
      shift 2
      ;;
    --help|-h)
      printf 'Usage: %s [--port PORT]\n' "$(basename "$0")"
      exit 0
      ;;
    *) die "Unknown option: $1" ;;
  esac
done

require_macos
validate_port "$port"
require_command launchctl
require_command lsof

info "[1/7] Checking mitmproxy installation"
ensure_mitmdump

info "[2/7] Checking mitmproxy CA"
generate_ca

info "[3/7] Checking certificate trust"
trust_ca

info "[4/7] Creating local service directories"
ensure_directories
write_config "$port"
success "Service directories ready"

info "[5/7] Installing LaunchAgent"
staged_plist="$(mktemp "$SERVICE_DIR/local.mitmproxy.plist.XXXXXX")"
cleanup_staged() { rm -f "$staged_plist"; }
trap cleanup_staged EXIT HUP INT TERM
render_plist "$staged_plist"
plutil -lint "$staged_plist" >/dev/null || die "Generated LaunchAgent plist is invalid."
if [[ -f "$PLIST_PATH" ]] && cmp -s "$PLIST_PATH" "$staged_plist"; then
  success "LaunchAgent configuration unchanged"
else
  if service_loaded; then
    bootout_service
  fi
  backup_if_changed "$PLIST_PATH" "$staged_plist"
  mv "$staged_plist" "$PLIST_PATH"
  success "LaunchAgent installed"
fi

info "[6/7] Starting mitmdump"
port_is_safe || die "Refusing to use a port owned by another process."
bootstrap_service
launchctl kickstart -k "$(service_target)" || die "Could not start $(service_target)."

info "[7/7] Verifying proxy listener"
wait_for_listener || die "mitmdump did not start listening. Inspect $LOG_DIR/stderr.log"
success "Listening on $MITMPROXY_HOST:$MITMPROXY_PORT"

printf '\nmitmproxy is ready.\n\nProxy endpoint:\n  http://%s:%s\n\n' "$MITMPROXY_HOST" "$MITMPROXY_PORT"
printf 'No applications have been configured to use this proxy.\n'
printf 'Configure only the applications you explicitly want to route through it.\n\nLogs:\n  %s/\n' "$LOG_DIR"
