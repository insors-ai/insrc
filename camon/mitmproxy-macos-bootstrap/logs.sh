#!/usr/bin/env bash

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

require_macos
load_config
case "${1:---stderr}" in
  --stdout) tail -f "$LOG_DIR/stdout.log" ;;
  --stderr) tail -f "$LOG_DIR/stderr.log" ;;
  --both) tail -f "$LOG_DIR/stdout.log" "$LOG_DIR/stderr.log" ;;
  --help|-h) printf 'Usage: %s [--stdout|--stderr|--both]\n' "$(basename "$0")" ;;
  *) die "Unknown option: $1" ;;
esac
