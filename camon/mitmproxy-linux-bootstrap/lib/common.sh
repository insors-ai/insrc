#!/usr/bin/env bash
# Shared helpers for the standalone, user-level Linux mitmproxy service.

set -euo pipefail

BOOTSTRAP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_PATH="$BOOTSTRAP_ROOT/templates/mitmproxy-local.service.template"
XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
CONFIG_DIR="$XDG_CONFIG_HOME/mitmproxy-local"
DATA_DIR="$XDG_DATA_HOME/mitmproxy-local"
LOG_DIR="$DATA_DIR/logs"
BACKUP_DIR="$DATA_DIR/backups"
CONFIG_PATH="$CONFIG_DIR/config.env"
DATA_CONFIG_PATH="$DATA_DIR/config.env"
SYSTEMD_DIR="$XDG_CONFIG_HOME/systemd/user"
SERVICE_NAME="mitmproxy-local.service"
SERVICE_PATH="$SYSTEMD_DIR/$SERVICE_NAME"
CA_DIR="$HOME/.mitmproxy"
CA_CERT_PATH="$CA_DIR/mitmproxy-ca-cert.pem"
MITMPROXY_HOST="127.0.0.1"
MITMPROXY_PORT="8080"
SYSTEM_CERT_INSTALLED="0"
MITMDUMP_BIN=""

info() { printf '%s\n' "$*"; }
success() { printf '✓ %s\n' "$*"; }
warn() { printf 'Warning: %s\n' "$*" >&2; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

require_linux() {
  [[ "$(uname -s)" == "Linux" ]] || die "This bootstrap supports Linux only."
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

require_systemd_user() {
  require_command systemctl
  systemctl --user show-environment >/dev/null 2>&1 \
    || die "A running systemd user manager is required (systemctl --user is unavailable)."
}

validate_port() {
  [[ "$1" =~ ^[0-9]+$ ]] || die "Port must be an integer between 1 and 65535."
  (( 10#$1 >= 1 && 10#$1 <= 65535 )) || die "Port must be an integer between 1 and 65535."
}

config_value() {
  local key="$1"
  local file="$2"
  awk -F= -v key="$key" '$1 == key { print substr($0, index($0, "=") + 1); exit }' "$file"
}

load_config() {
  MITMPROXY_HOST="127.0.0.1"
  MITMPROXY_PORT="8080"
  SYSTEM_CERT_INSTALLED="0"
  local file value
  file="$CONFIG_PATH"
  [[ -f "$file" ]] || file="$DATA_CONFIG_PATH"
  if [[ -f "$file" ]]; then
    value="$(config_value MITMPROXY_HOST "$file")"; [[ -z "$value" ]] || MITMPROXY_HOST="$value"
    value="$(config_value MITMPROXY_PORT "$file")"; [[ -z "$value" ]] || MITMPROXY_PORT="$value"
    value="$(config_value SYSTEMD_SERVICE "$file")"; [[ -z "$value" || "$value" == "$SERVICE_NAME" ]] || die "Unexpected systemd service name."
    value="$(config_value SYSTEM_CERT_INSTALLED "$file")"; [[ -z "$value" ]] || SYSTEM_CERT_INSTALLED="$value"
  fi
  [[ "$MITMPROXY_HOST" == "127.0.0.1" ]] || die "Only 127.0.0.1 is supported."
  [[ "$SYSTEM_CERT_INSTALLED" == "0" || "$SYSTEM_CERT_INSTALLED" == "1" ]] || die "Invalid certificate-trust state."
  validate_port "$MITMPROXY_PORT"
}

ensure_directories() {
  mkdir -p "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR" "$BACKUP_DIR" "$SYSTEMD_DIR"
  touch "$LOG_DIR/stdout.log" "$LOG_DIR/stderr.log"
}

backup_if_changed() {
  local existing="$1" replacement="$2" label="${3:-$(basename "$1")}" backup_name
  if [[ -f "$existing" ]] && ! cmp -s "$existing" "$replacement"; then
    backup_name="$label.backup-$(date +%Y%m%d-%H%M%S)"
    cp -p "$existing" "$BACKUP_DIR/$backup_name"
    info "Backed up existing $(basename "$existing") to backups/$backup_name"
  fi
}

write_config() {
  local port="$1" system_cert="$2" staged
  ensure_directories
  staged="$(mktemp "$DATA_DIR/config.env.XXXXXX")"
  printf 'MITMPROXY_HOST=127.0.0.1\nMITMPROXY_PORT=%s\nSYSTEMD_SERVICE=%s\nSYSTEM_CERT_INSTALLED=%s\n' \
    "$port" "$SERVICE_NAME" "$system_cert" > "$staged"
  backup_if_changed "$CONFIG_PATH" "$staged" "config.env"
  if [[ ! -f "$CONFIG_PATH" ]] || ! cmp -s "$CONFIG_PATH" "$staged"; then
    mv "$staged" "$CONFIG_PATH"
    chmod 600 "$CONFIG_PATH"
    staged=""
  else
    success "Service configuration unchanged"
    rm -f "$staged"; staged=""
  fi
  local mirror
  mirror="$(mktemp "$DATA_DIR/data-config.env.XXXXXX")"
  cp "$CONFIG_PATH" "$mirror"
  backup_if_changed "$DATA_CONFIG_PATH" "$mirror" "data-config.env"
  if [[ ! -f "$DATA_CONFIG_PATH" ]] || ! cmp -s "$DATA_CONFIG_PATH" "$mirror"; then
    mv "$mirror" "$DATA_CONFIG_PATH"
    chmod 600 "$DATA_CONFIG_PATH"
  else
    rm -f "$mirror"
  fi
  load_config
}

resolve_mitmdump() {
  MITMDUMP_BIN="$(command -v mitmdump || true)"
  [[ -n "$MITMDUMP_BIN" ]] || return 1
  [[ "$MITMDUMP_BIN" = /* ]] || MITMDUMP_BIN="$(cd "$(dirname "$MITMDUMP_BIN")" && pwd)/$(basename "$MITMDUMP_BIN")"
}

install_mitmproxy() {
  if command -v pipx >/dev/null 2>&1; then
    info "Installing mitmproxy with pipx..."
    pipx install mitmproxy
    export PATH="$HOME/.local/bin:$PATH"
  elif command -v apt-get >/dev/null 2>&1; then
    info "Installing mitmproxy with apt (sudo authorization may be requested)..."
    sudo apt-get update
    sudo apt-get install -y mitmproxy
  elif command -v dnf >/dev/null 2>&1; then
    info "Installing mitmproxy with dnf (sudo authorization may be requested)..."
    sudo dnf install -y mitmproxy
  elif command -v pacman >/dev/null 2>&1; then
    info "Installing mitmproxy with pacman (sudo authorization may be requested)..."
    sudo pacman -S --needed mitmproxy
  elif command -v zypper >/dev/null 2>&1; then
    info "Installing mitmproxy with zypper (sudo authorization may be requested)..."
    sudo zypper install -y mitmproxy
  else
    die "mitmdump is not installed and no supported installer was found. Install mitmproxy yourself, then rerun."
  fi
  resolve_mitmdump || die "mitmproxy was installed but mitmdump is not on PATH. Open a new shell or add its install location to PATH."
}

ensure_mitmdump() {
  local skip_install="$1"
  if resolve_mitmdump; then
    success "mitmproxy already installed: $MITMDUMP_BIN"
  elif [[ "$skip_install" == true ]]; then
    die "mitmdump is not installed. Install mitmproxy yourself, ensure it is on PATH, then rerun without --skip-install."
  else
    install_mitmproxy
  fi
  "$MITMDUMP_BIN" --version
}

ca_exists() { [[ -f "$CA_CERT_PATH" ]]; }

generate_ca() (
  ca_exists && { success "CA already generated"; exit 0; }
  local temporary_port="" candidate temporary_log temporary_pid="" attempt
  for candidate in $(seq 18080 18089); do
    MITMPROXY_PORT="$candidate"
    [[ -z "$(listener_pids)" ]] && { temporary_port="$candidate"; break; }
  done
  [[ -n "$temporary_port" ]] || die "No free temporary port found for CA generation (tried 18080-18089)."
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
  for ((attempt = 1; attempt <= 15; attempt++)); do
    ca_exists && { success "CA generated"; exit 0; }
    sleep 1
  done
  die "Timed out generating the mitmproxy CA."
)

nss_database_path() { printf '%s' "$HOME/.pki/nssdb"; }

user_cert_trusted() {
  command -v certutil >/dev/null 2>&1 || return 1
  local database
  database="$(nss_database_path)"
  [[ -d "$database" ]] || return 1
  certutil -L -d "sql:$database" -n mitmproxy >/dev/null 2>&1
}

install_user_cert() {
  if ! command -v certutil >/dev/null 2>&1; then
    warn "certutil is unavailable; CA was generated but user NSS trust was not configured."
    warn "Install your distribution's NSS tools and import: $CA_CERT_PATH"
    return 0
  fi
  local database
  database="$(nss_database_path)"
  if user_cert_trusted; then
    success "User NSS trust already configured"
    return 0
  fi
  if [[ ! -d "$database" ]]; then
    mkdir -p "$database"
    certutil -d "sql:$database" -N --empty-password
  fi
  certutil -d "sql:$database" -A -t "C,," -n mitmproxy -i "$CA_CERT_PATH"
  success "Installed CA in user NSS database: $database"
}

install_system_cert() {
  local copied_path=""
  if command -v apt-get >/dev/null 2>&1; then
    copied_path="/usr/local/share/ca-certificates/mitmproxy-local.crt"
    sudo cp "$CA_CERT_PATH" "$copied_path"
    sudo update-ca-certificates
  elif command -v dnf >/dev/null 2>&1; then
    copied_path="/etc/pki/ca-trust/source/anchors/mitmproxy-local.crt"
    sudo cp "$CA_CERT_PATH" "$copied_path"
    sudo update-ca-trust
  elif command -v zypper >/dev/null 2>&1; then
    copied_path="/etc/pki/trust/anchors/mitmproxy-local.pem"
    sudo cp "$CA_CERT_PATH" "$copied_path"
    sudo update-ca-certificates
  elif command -v pacman >/dev/null 2>&1; then
    die "Arch system trust setup varies. Import $CA_CERT_PATH using your configured trust-store mechanism, then rerun without --system-cert."
  else
    die "No supported system trust-store method was detected."
  fi
  success "Installed CA in system trust store: $copied_path"
}

system_cert_path() {
  if command -v apt-get >/dev/null 2>&1; then printf '%s' "/usr/local/share/ca-certificates/mitmproxy-local.crt"
  elif command -v dnf >/dev/null 2>&1; then printf '%s' "/etc/pki/ca-trust/source/anchors/mitmproxy-local.crt"
  elif command -v zypper >/dev/null 2>&1; then printf '%s' "/etc/pki/trust/anchors/mitmproxy-local.pem"
  fi
}

system_cert_present() {
  local path
  path="$(system_cert_path || true)"
  [[ -n "$path" && -f "$path" ]]
}

systemd_exec_quote() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

render_service() {
  local target="$1" line
  [[ -f "$TEMPLATE_PATH" ]] || die "Missing systemd template: $TEMPLATE_PATH"
  [[ -n "$MITMDUMP_BIN" ]] || die "mitmdump path has not been resolved."
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      *'@CONFIG_PATH@'*) printf 'EnvironmentFile="%s"\n' "$(systemd_exec_quote "$CONFIG_PATH")" ;;
      *'@EXEC_START@'*) printf 'ExecStart="%s" --listen-host 127.0.0.1 --listen-port %s\n' "$(systemd_exec_quote "$MITMDUMP_BIN")" "$MITMPROXY_PORT" ;;
      *'@WORKING_DIRECTORY@'*) printf 'WorkingDirectory="%s"\n' "$(systemd_exec_quote "$DATA_DIR")" ;;
      *'@STDOUT_LOG@'*) printf 'StandardOutput="append:%s"\n' "$(systemd_exec_quote "$LOG_DIR/stdout.log")" ;;
      *'@STDERR_LOG@'*) printf 'StandardError="append:%s"\n' "$(systemd_exec_quote "$LOG_DIR/stderr.log")" ;;
      *) printf '%s\n' "$line" ;;
    esac
  done < "$TEMPLATE_PATH" > "$target"
}

validate_service() {
  if command -v systemd-analyze >/dev/null 2>&1; then
    systemd-analyze --user verify "$1" || die "Generated systemd user service is invalid."
  else
    warn "systemd-analyze is unavailable; skipped unit validation."
  fi
}

systemd_reload() { systemctl --user daemon-reload || die "Could not reload the systemd user manager."; }
service_enabled() { systemctl --user is-enabled --quiet "$SERVICE_NAME"; }
service_running() { systemctl --user is-active --quiet "$SERVICE_NAME"; }
service_pid() { systemctl --user show --property MainPID --value "$SERVICE_NAME" 2>/dev/null || true; }

listener_details() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp "sport = :$MITMPROXY_PORT" 2>/dev/null | sed -n '2,$p'
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$MITMPROXY_PORT" -sTCP:LISTEN 2>/dev/null || true
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ltnp 2>/dev/null | grep -E "[:.]$MITMPROXY_PORT([[:space:]]|$)" || true
  else
    die "No supported port-inspection tool found (need ss, lsof, or netstat)."
  fi
}

listener_active() {
  listener_details | grep -Eq "127\.0\.0\.1:$MITMPROXY_PORT([[:space:]]|$)"
}

listener_pids() {
  if command -v ss >/dev/null 2>&1; then
    listener_details | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true
  elif command -v lsof >/dev/null 2>&1; then
    lsof -t -nP -iTCP:"$MITMPROXY_PORT" -sTCP:LISTEN 2>/dev/null || true
  else
    return 0
  fi
}

port_is_safe() {
  local pids managed_pid
  pids="$(listener_pids)"
  [[ -z "$pids" ]] && return 0
  managed_pid="$(service_pid)"
  if [[ "$managed_pid" =~ ^[1-9][0-9]*$ ]] && grep -qx "$managed_pid" <<< "$pids"; then
    return 0
  fi
  warn "Port $MITMPROXY_PORT is already in use by:"
  listener_details >&2 || true
  return 1
}

wait_for_listener() {
  local attempts="${1:-10}" attempt
  for ((attempt = 1; attempt <= attempts; attempt++)); do
    listener_active && return 0
    sleep 1
  done
  return 1
}
