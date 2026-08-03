#!/usr/bin/env bash

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

remove_data=false
remove_user_cert=false
remove_system_cert=false
while (( $# > 0 )); do
  case "$1" in
    --remove-data) remove_data=true ;;
    --remove-user-cert) remove_user_cert=true ;;
    --remove-system-cert) remove_system_cert=true ;;
    --help|-h)
      printf 'Usage: %s [--remove-data] [--remove-user-cert] [--remove-system-cert]\n' "$(basename "$0")"
      exit 0
      ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

require_linux
load_config
if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
  if service_running; then
    systemctl --user stop "$SERVICE_NAME" || die "Could not stop $SERVICE_NAME."
  fi
  if service_enabled; then
    systemctl --user disable "$SERVICE_NAME" || die "Could not disable $SERVICE_NAME."
  fi
else
  warn "A systemd user manager is unavailable; could not stop or disable the service."
fi

if [[ -f "$SERVICE_PATH" ]]; then
  rm -f "$SERVICE_PATH"
  info "Removed: $SERVICE_PATH"
  command -v systemctl >/dev/null 2>&1 && systemctl --user daemon-reload || true
else
  info "Preserved: no systemd user service file was present"
fi

if [[ "$remove_user_cert" == true ]]; then
  if user_cert_trusted; then
    certutil -D -d "sql:$(nss_database_path)" -n mitmproxy
    info "Removed: mitmproxy certificate from user NSS database"
  else
    info "Preserved: no mitmproxy certificate was found in the user NSS database"
  fi
else
  info "Preserved: user NSS certificate trust (use --remove-user-cert to remove it)"
fi

if [[ "$remove_system_cert" == true ]]; then
  if [[ "$SYSTEM_CERT_INSTALLED" != "1" ]]; then
    warn "No system certificate installation is recorded for this project; nothing was removed."
  else
    trust_path="$(system_cert_path || true)"
    if [[ -n "$trust_path" && -f "$trust_path" ]]; then
      sudo rm -f "$trust_path"
      if command -v apt-get >/dev/null 2>&1 || command -v zypper >/dev/null 2>&1; then
        sudo update-ca-certificates
      elif command -v dnf >/dev/null 2>&1; then
        sudo update-ca-trust
      fi
      info "Removed: system trust certificate $trust_path"
    else
      warn "Recorded system trust certificate was already absent."
    fi
  fi
else
  info "Preserved: system certificate trust (use --remove-system-cert to remove project-installed trust)"
fi

if [[ "$remove_data" == true ]]; then
  if [[ -d "$DATA_DIR" ]]; then rm -rf "$DATA_DIR"; info "Removed: $DATA_DIR"; fi
  if [[ -d "$CONFIG_DIR" ]]; then rm -rf "$CONFIG_DIR"; info "Removed: $CONFIG_DIR"; fi
else
  info "Preserved: $DATA_DIR and $CONFIG_DIR (logs and configuration; use --remove-data to remove them)"
fi
info "Preserved: mitmproxy installation and $CA_DIR (CA files)."
