#!/usr/bin/env bash
# Shared helpers for the local, user-level mitmproxy LaunchAgent.

set -euo pipefail

BOOTSTRAP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_PATH="$BOOTSTRAP_ROOT/templates/local.mitmproxy.plist.template"
SERVICE_DIR="$HOME/Library/Application Support/mitmproxy-local"
LOG_DIR="$SERVICE_DIR/logs"
BACKUP_DIR="$SERVICE_DIR/backups"
CONFIG_PATH="$SERVICE_DIR/config.env"
PLIST_PATH="$HOME/Library/LaunchAgents/local.mitmproxy.plist"
CA_DIR="$HOME/.mitmproxy"
CA_CERT_PATH="$CA_DIR/mitmproxy-ca-cert.pem"
LAUNCH_AGENT_LABEL="local.mitmproxy"
MITMPROXY_HOST="127.0.0.1"
MITMPROXY_PORT="8080"
MITMDUMP_BIN=""

info() { printf '%s\n' "$*"; }
success() { printf '✓ %s\n' "$*"; }
warn() { printf 'Warning: %s\n' "$*" >&2; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

require_macos() {
  [[ "$(uname -s)" == "Darwin" ]] || die "This bootstrap supports macOS only."
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

validate_port() {
  [[ "$1" =~ ^[0-9]+$ ]] || die "Port must be an integer between 1 and 65535."
  (( 10#$1 >= 1 && 10#$1 <= 65535 )) || die "Port must be an integer between 1 and 65535."
}

load_config() {
  MITMPROXY_HOST="127.0.0.1"
  MITMPROXY_PORT="8080"
  LAUNCH_AGENT_LABEL="local.mitmproxy"
  if [[ -f "$CONFIG_PATH" ]]; then
    local value
    value="$(awk -F= '$1 == "MITMPROXY_HOST" { print substr($0, index($0, "=") + 1); exit }' "$CONFIG_PATH")"
    [[ -z "$value" ]] || MITMPROXY_HOST="$value"
    value="$(awk -F= '$1 == "MITMPROXY_PORT" { print substr($0, index($0, "=") + 1); exit }' "$CONFIG_PATH")"
    [[ -z "$value" ]] || MITMPROXY_PORT="$value"
    value="$(awk -F= '$1 == "LAUNCH_AGENT_LABEL" { print substr($0, index($0, "=") + 1); exit }' "$CONFIG_PATH")"
    [[ -z "$value" ]] || LAUNCH_AGENT_LABEL="$value"
  fi
  [[ "$MITMPROXY_HOST" == "127.0.0.1" ]] || die "Only 127.0.0.1 is supported."
  [[ "$LAUNCH_AGENT_LABEL" == "local.mitmproxy" ]] || die "Unexpected LaunchAgent label."
  validate_port "$MITMPROXY_PORT"
}

ensure_directories() {
  mkdir -p "$LOG_DIR" "$BACKUP_DIR" "$(dirname "$PLIST_PATH")"
  touch "$LOG_DIR/stdout.log" "$LOG_DIR/stderr.log"
}

backup_if_changed() {
  local existing="$1"
  local replacement="$2"
  local backup_name
  if [[ -f "$existing" ]] && ! cmp -s "$existing" "$replacement"; then
    backup_name="$(basename "$existing").backup-$(date +%Y%m%d-%H%M%S)"
    cp -p "$existing" "$BACKUP_DIR/$backup_name"
    info "Backed up existing $(basename "$existing") to backups/$backup_name"
  fi
}

write_config() {
  local port="$1"
  local staged
  ensure_directories
  staged="$(mktemp "$SERVICE_DIR/config.env.XXXXXX")"
  printf 'MITMPROXY_HOST=127.0.0.1\nMITMPROXY_PORT=%s\nLAUNCH_AGENT_LABEL=local.mitmproxy\n' "$port" > "$staged"
  backup_if_changed "$CONFIG_PATH" "$staged"
  if [[ -f "$CONFIG_PATH" ]] && cmp -s "$CONFIG_PATH" "$staged"; then
    success "LaunchAgent configuration unchanged"
    rm -f "$staged"
  else
    mv "$staged" "$CONFIG_PATH"
  fi
  load_config
}

resolve_mitmdump() {
  MITMDUMP_BIN="$(command -v mitmdump || true)"
  [[ -n "$MITMDUMP_BIN" ]] || return 1
  [[ "$MITMDUMP_BIN" = /* ]] || MITMDUMP_BIN="$(cd "$(dirname "$MITMDUMP_BIN")" && pwd)/$(basename "$MITMDUMP_BIN")"
  return 0
}

ensure_mitmdump() {
  if resolve_mitmdump; then
    success "mitmproxy already installed: $MITMDUMP_BIN"
  else
    cat >&2 <<'EOF'
mitmdump is not installed, so the local service was not configured.

Install mitmproxy yourself, then rerun this installer. For Homebrew:
  brew install mitmproxy

After installation, verify it is available:
  command -v mitmdump
  mitmdump --version

This bootstrap never installs Homebrew or mitmproxy automatically.
EOF
    exit 1
  fi
  "$MITMDUMP_BIN" --version
}

xml_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g' -e "s/'/\&apos;/g"
}

render_plist() {
  local target="$1"
  [[ -f "$TEMPLATE_PATH" ]] || die "Missing plist template: $TEMPLATE_PATH"
  [[ -n "$MITMDUMP_BIN" ]] || die "mitmdump path has not been resolved."
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      *'@MITMDUMP_BIN@'*) printf '    <string>%s</string>\n' "$(xml_escape "$MITMDUMP_BIN")" ;;
      *'@MITMPROXY_HOST@'*) printf '    <string>%s</string>\n' "$(xml_escape "$MITMPROXY_HOST")" ;;
      *'@MITMPROXY_PORT@'*) printf '    <string>%s</string>\n' "$(xml_escape "$MITMPROXY_PORT")" ;;
      *'@WORKING_DIRECTORY@'*) printf '  <string>%s</string>\n' "$(xml_escape "$SERVICE_DIR")" ;;
      *'@STDOUT_LOG@'*) printf '  <string>%s</string>\n' "$(xml_escape "$LOG_DIR/stdout.log")" ;;
      *'@STDERR_LOG@'*) printf '  <string>%s</string>\n' "$(xml_escape "$LOG_DIR/stderr.log")" ;;
      *) printf '%s\n' "$line" ;;
    esac
  done < "$TEMPLATE_PATH" > "$target"
}

service_target() { printf 'gui/%s/%s' "$(id -u)" "$LAUNCH_AGENT_LABEL"; }

service_loaded() { launchctl print "$(service_target)" >/dev/null 2>&1; }

service_pid() {
  launchctl print "$(service_target)" 2>/dev/null | awk '/^[[:space:]]*pid = [0-9]+;/ { gsub(/;/, "", $3); print $3; exit }'
}

listener_pids() { lsof -t -nP -iTCP:"$MITMPROXY_PORT" -sTCP:LISTEN 2>/dev/null || true; }

listener_active() {
  lsof -nP -iTCP@"$MITMPROXY_HOST":"$MITMPROXY_PORT" -sTCP:LISTEN >/dev/null 2>&1
}

port_is_safe() {
  local pids service
  pids="$(listener_pids)"
  [[ -z "$pids" ]] && return 0
  service="$(service_pid || true)"
  if [[ -n "$service" ]] && grep -qx "$service" <<< "$pids"; then
    return 0
  fi
  warn "Port $MITMPROXY_PORT is already in use by:"
  lsof -nP -iTCP:"$MITMPROXY_PORT" -sTCP:LISTEN >&2 || true
  return 1
}

wait_for_listener() {
  local tries="${1:-10}"
  local attempt
  for ((attempt = 1; attempt <= tries; attempt++)); do
    listener_active && return 0
    sleep 1
  done
  return 1
}

bootout_service() {
  if service_loaded; then
    launchctl bootout "$(service_target)" || die "Could not unload $(service_target)."
  else
    success "LaunchAgent already stopped"
  fi
}

bootstrap_service() {
  if service_loaded; then
    return 0
  fi
  launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH" || die "Could not bootstrap $PLIST_PATH."
}

ca_exists() { [[ -f "$CA_CERT_PATH" ]]; }

certificate_trusted() {
  ca_exists || return 1
  command -v security >/dev/null 2>&1 || return 1
  command -v openssl >/dev/null 2>&1 || return 1
  local expected actual
  expected="$(openssl x509 -in "$CA_CERT_PATH" -noout -fingerprint -sha256 2>/dev/null | tr -d '\r')"
  actual="$(security find-certificate -a -p -c mitmproxy "$HOME/Library/Keychains/login.keychain-db" 2>/dev/null | openssl x509 -noout -fingerprint -sha256 2>/dev/null | tr -d '\r')"
  [[ -n "$expected" && "$expected" == "$actual" ]]
}

generate_ca() (
  ca_exists && { success "CA already generated"; return; }
  local temporary_port=""
  local candidate
  for candidate in $(seq 18080 18089); do
    MITMPROXY_PORT="$candidate"
    [[ -z "$(listener_pids)" ]] && { temporary_port="$candidate"; break; }
  done
  [[ -n "$temporary_port" ]] || die "No free temporary port found for CA generation (tried 18080-18089)."
  local temporary_log temporary_pid=""
  temporary_log="$(mktemp "${TMPDIR:-/tmp}/mitmproxy-ca.XXXXXX.log")"
  cleanup_ca() {
    if [[ -n "$temporary_pid" ]] && kill -0 "$temporary_pid" 2>/dev/null; then
      kill -TERM "$temporary_pid" 2>/dev/null || true
      wait "$temporary_pid" 2>/dev/null || true
    fi
    rm -f "$temporary_log"
  }
  trap cleanup_ca EXIT HUP INT TERM
  "$MITMDUMP_BIN" --listen-host 127.0.0.1 --listen-port "$temporary_port" > "$temporary_log" 2>&1 &
  temporary_pid=$!
  local attempt
  for ((attempt = 1; attempt <= 15; attempt++)); do
    ca_exists && { success "CA generated"; exit 0; }
    sleep 1
  done
  die "Timed out generating the mitmproxy CA."
)

trust_ca() {
  certificate_trusted && { success "CA already trusted"; return; }
  info "Adding mitmproxy CA to the current user's login keychain (macOS may prompt for authorization)..."
  security add-trusted-cert -r trustRoot -k "$HOME/Library/Keychains/login.keychain-db" "$CA_CERT_PATH" \
    || die "Could not trust the mitmproxy CA in the login keychain."
  certificate_trusted && success "CA trusted" || warn "CA added, but trust verification is best-effort and could not confirm it."
}
