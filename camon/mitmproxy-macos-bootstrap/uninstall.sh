#!/usr/bin/env bash

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

remove_data=false
remove_cert=false
while (( $# > 0 )); do
  case "$1" in
    --remove-data) remove_data=true ;;
    --remove-cert) remove_cert=true ;;
    --help|-h)
      printf 'Usage: %s [--remove-data] [--remove-cert]\n' "$(basename "$0")"
      exit 0
      ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

require_macos
load_config
if command -v launchctl >/dev/null 2>&1; then
  bootout_service
else
  warn "launchctl is unavailable; could not unload the LaunchAgent."
fi

if [[ -f "$PLIST_PATH" ]]; then
  rm -f "$PLIST_PATH"
  info "Removed: $PLIST_PATH"
else
  info "Preserved: no LaunchAgent plist was present"
fi

if [[ "$remove_cert" == true ]]; then
  if ca_exists && command -v security >/dev/null 2>&1 && command -v openssl >/dev/null 2>&1; then
    fingerprint="$(openssl x509 -in "$CA_CERT_PATH" -noout -fingerprint -sha1 | awk -F= '{ gsub(/:/, "", $2); print $2 }')"
    if [[ -n "$fingerprint" ]] && security delete-certificate -Z "$fingerprint" "$HOME/Library/Keychains/login.keychain-db"; then
      info "Removed: matching mitmproxy certificate from the login keychain"
    else
      warn "Could not remove the matching certificate (it may already be absent)."
    fi
  else
    warn "Could not identify a local mitmproxy certificate to remove."
  fi
else
  info "Preserved: login-keychain certificate trust (use --remove-cert to remove it)"
fi

if [[ "$remove_data" == true ]]; then
  if [[ -d "$SERVICE_DIR" ]]; then
    rm -rf "$SERVICE_DIR"
    info "Removed: $SERVICE_DIR"
  fi
else
  info "Preserved: $SERVICE_DIR (logs, configuration, and backups; use --remove-data to remove it)"
fi

info "Preserved: mitmproxy installation and $CA_DIR (CA files)."
