#!/usr/bin/env bash

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

selected_port=""
skip_install=false
install_system_cert=false
enable_linger=false
while (( $# > 0 )); do
  case "$1" in
    --port) (( $# >= 2 )) || die "--port requires a value."; selected_port="$2"; shift 2 ;;
    --skip-install) skip_install=true; shift ;;
    --system-cert) install_system_cert=true; shift ;;
    --enable-linger) enable_linger=true; shift ;;
    --help|-h)
      printf 'Usage: %s [--port PORT] [--skip-install] [--system-cert] [--enable-linger]\n' "$(basename "$0")"
      exit 0
      ;;
    *) die "Unknown option: $1" ;;
  esac
done

require_linux
require_systemd_user
load_config
[[ -z "$selected_port" ]] || { validate_port "$selected_port"; MITMPROXY_PORT="$selected_port"; }

info "[1/8] Checking mitmproxy installation"
ensure_mitmdump "$skip_install"

info "[2/8] Checking mitmproxy CA"
generate_ca

info "[3/8] Checking certificate trust"
install_user_cert
if [[ "$install_system_cert" == true ]]; then
  info "Installing CA in the system trust store (sudo authorization may be requested)..."
  install_system_cert
  SYSTEM_CERT_INSTALLED="1"
fi

info "[4/8] Creating local service directories"
ensure_directories
write_config "$MITMPROXY_PORT" "$SYSTEM_CERT_INSTALLED"
success "Service directories ready"

info "[5/8] Installing systemd user service"
staged_service="$(mktemp "$DATA_DIR/$SERVICE_NAME.XXXXXX")"
cleanup_staged() { rm -f "$staged_service"; }
trap cleanup_staged EXIT HUP INT TERM
render_service "$staged_service"
validate_service "$staged_service"
if [[ -f "$SERVICE_PATH" ]] && cmp -s "$SERVICE_PATH" "$staged_service"; then
  success "Service configuration unchanged"
else
  backup_if_changed "$SERVICE_PATH" "$staged_service" "$SERVICE_NAME"
  mv "$staged_service" "$SERVICE_PATH"
  success "Systemd user service installed"
fi

info "[6/8] Reloading systemd user manager"
systemd_reload
if [[ "$enable_linger" == true ]]; then
  command -v loginctl >/dev/null 2>&1 || die "loginctl is required for --enable-linger."
  loginctl enable-linger "$USER"
  success "Enabled systemd user lingering for $USER"
fi

info "[7/8] Starting mitmdump"
port_is_safe || die "Refusing to use a port owned by another process."
systemctl --user enable --now "$SERVICE_NAME" || die "Could not enable and start $SERVICE_NAME."

info "[8/8] Verifying proxy listener"
wait_for_listener || die "mitmdump did not start listening. Inspect $LOG_DIR/stderr.log"
success "Listening on $MITMPROXY_HOST:$MITMPROXY_PORT"

printf '\nmitmproxy is ready.\n\nProxy endpoint:\n  http://%s:%s\n\n' "$MITMPROXY_HOST" "$MITMPROXY_PORT"
printf 'No applications have been configured to use this proxy.\n'
printf 'Configure only the applications you explicitly want to route through it.\n\n'
printf 'Service:\n  systemctl --user status %s\n\nLogs:\n  journalctl --user -u %s -f\n' "$SERVICE_NAME" "$SERVICE_NAME"
