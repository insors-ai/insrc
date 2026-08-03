#!/usr/bin/env bash
# Install the CAMON TUI into the current user's ~/.insrc/camon directory.

set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_ROOT="$HOME/.insrc/camon"
VENV_PATH="$INSTALL_ROOT/venv"
BIN_PATH="$INSTALL_ROOT/bin"
PATH_MARKER_BEGIN="# >>> insrc camon >>>"
PATH_MARKER_END="# <<< insrc camon <<<"
add_path=true
run_proxy_setup=false

info() { printf '%s\n' "$*"; }
success() { printf '✓ %s\n' "$*"; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: ./install.sh [--setup-proxy] [--no-path]

Installs CAMON's TUI into ~/.insrc/camon.

  --setup-proxy  Run the detected macOS/Linux mitmproxy bootstrap without prompting.
  --no-path      Do not add ~/.insrc/camon/bin to the current shell's startup file.
EOF
}

while (( $# > 0 )); do
  case "$1" in
    --setup-proxy) run_proxy_setup=true ;;
    --no-path) add_path=false ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

platform="$(uname -s)"
case "$platform" in
  Darwin) proxy_setup="$SOURCE_ROOT/mitmproxy-macos-bootstrap/install.sh" ;;
  Linux) proxy_setup="$SOURCE_ROOT/mitmproxy-linux-bootstrap/install.sh" ;;
  *) die "CAMON's installer supports macOS and Linux only (detected: $platform)." ;;
esac
[[ -x "$proxy_setup" ]] || die "Missing platform mitmproxy bootstrap: $proxy_setup"

if [[ "$run_proxy_setup" != true ]]; then
  read -r -p "Run the $platform local mitmproxy setup now? [y/N] " response
  case "$response" in
    y|Y|yes|YES) run_proxy_setup=true ;;
    *) run_proxy_setup=false ;;
  esac
fi

if [[ "$run_proxy_setup" == true ]]; then
  info "Running $proxy_setup"
  "$proxy_setup"
fi

MITMDUMP_BIN="$(command -v mitmdump || true)"
[[ -n "$MITMDUMP_BIN" ]] || die "mitmdump was not detected. Install mitmproxy, then rerun this installer."
info "Detected mitmdump: $MITMDUMP_BIN"
"$MITMDUMP_BIN" --version

find_python() {
  local candidate minor
  for candidate in python3.12 python3; do
    command -v "$candidate" >/dev/null 2>&1 || continue
    minor="$($candidate -c 'import sys; print(sys.version_info.minor if sys.version_info.major == 3 else -1)')"
    if (( minor >= 12 )); then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

PYTHON_BIN="$(find_python || true)"
[[ -n "$PYTHON_BIN" ]] || die "Python 3.12 or newer is required to install CAMON."

if [[ -d "$VENV_PATH" ]]; then
  [[ -x "$VENV_PATH/bin/python" ]] || die "Existing virtual environment is invalid: $VENV_PATH. Remove it manually, then rerun."
  venv_minor="$($VENV_PATH/bin/python -c 'import sys; print(sys.version_info.minor if sys.version_info.major == 3 else -1)')"
  (( venv_minor >= 12 )) || die "Existing virtual environment needs Python 3.12 or newer: $VENV_PATH. Remove it manually, then rerun."
fi
mkdir -p "$INSTALL_ROOT" "$BIN_PATH"
if [[ ! -d "$VENV_PATH" ]]; then
  info "Creating Python virtual environment at $VENV_PATH"
  "$PYTHON_BIN" -m venv "$VENV_PATH"
fi

info "Installing CAMON TUI and its compatible mitmproxy runtime into $VENV_PATH"
"$VENV_PATH/bin/python" -m pip install --upgrade "$SOURCE_ROOT[proxy]"

printf '#!/usr/bin/env bash\nexport CAMON_DATABASE=%q\nexport CAMON_RETENTION_DAYS=7\nexec %q "$@"\n' \
  "$INSTALL_ROOT/camon.sqlite3" "$VENV_PATH/bin/camon" > "$BIN_PATH/camon"
chmod 755 "$BIN_PATH/camon"
success "Installed CAMON launcher: $BIN_PATH/camon"
if "$BIN_PATH/camon" register; then
  success "CAMON addon registration complete"
else
  info "CAMON TUI was installed, but its addon was not registered with a known local service."
  info "After configuring your local service, run: $BIN_PATH/camon register"
fi

add_to_path() {
  local shell_name startup_file
  shell_name="$(basename "${SHELL:-}")"
  case "$shell_name" in
    zsh) startup_file="$HOME/.zshrc" ;;
    bash) startup_file="$HOME/.bashrc" ;;
    *)
      info "Add this directory to PATH manually for your shell: $BIN_PATH"
      return 0
      ;;
  esac
  touch "$startup_file"
  if grep -Fq "$PATH_MARKER_BEGIN" "$startup_file"; then
    success "PATH entry already present in $startup_file"
  else
    printf '\n%s\nexport PATH="$HOME/.insrc/camon/bin:$PATH"\n%s\n' \
      "$PATH_MARKER_BEGIN" "$PATH_MARKER_END" >> "$startup_file"
    success "Added CAMON to PATH in $startup_file"
  fi
}

if [[ "$add_path" == true ]]; then
  add_to_path
fi

printf '\nCAMON TUI installed.\n\nRun:\n  %s/camon\n\n' "$BIN_PATH"
if [[ "$add_path" == true ]]; then
  printf 'Open a new shell (or run: export PATH="$HOME/.insrc/camon/bin:$PATH") and use:\n  camon\n'
fi
