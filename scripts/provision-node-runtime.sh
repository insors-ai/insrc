#!/bin/bash
# Copyright (c) Procix Software India. Licensed under the MIT License.
# Usage: provision-node-runtime.sh STATE_ROOT [OFFLINE_ARCHIVE]
# Outputs the verified distribution root. Never requires a global node or npm.
set -euo pipefail
umask 077
unset NODE_OPTIONS NODE_PATH
# Verification must not resolve a caller's replacement hash/archive utilities.
PATH=/usr/bin:/bin:/usr/sbin:/sbin
HERE=$(cd "$(dirname "$0")" && pwd -P)
. "$HERE/node-runtime-policy.sh"
fail() { printf 'Node runtime provisioning: %s\n' "$*" >&2; exit 1; }
[ "$#" -ge 1 ] && [ "$#" -le 2 ] || fail 'expected STATE_ROOT [OFFLINE_ARCHIVE]'
case "$(uname -s)" in Darwin) platform=darwin ;; Linux) platform=linux ;; *) fail 'unsupported operating system' ;; esac
case "$(uname -m)" in arm64|aarch64) architecture=arm64 ;; x86_64|amd64) architecture=x64 ;; *) fail 'unsupported architecture' ;; esac
target="$platform-$architecture"
insrc_node_runtime_policy "$target"
mkdir -p "$1"
state=$(cd "$1" && pwd -P)
store="$state/runtimes"
[ ! -L "$store" ] || fail 'runtime store is a symbolic link'
mkdir -p "$store"
chmod 700 "$store"
parent="$store/node-v$INSRC_RUNTIME_VERSION-$target"
[ ! -L "$parent" ] || fail 'runtime version directory is a symbolic link'
mkdir -p "$parent"
chmod 700 "$parent"
final="$parent/$INSRC_RUNTIME_SHA256"
lock="$final.lock"
stage=
locked=0
cleanup() {
  [ -z "$stage" ] || rm -rf -- "$stage"
  if [ "$locked" = 1 ]; then rmdir "$lock"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
attempt=0
until mkdir "$lock" 2>/dev/null; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || fail "runtime store is busy; inspect the retained lock before retrying: $lock"
  sleep 1
done
locked=1
stage=$(mktemp -d "$parent/.prepare-XXXXXXXX")
snapshot="$stage/archive.tar.gz"
if [ -e "$final" ] || [ -L "$final" ]; then
  [ ! -L "$final" ] && [ -d "$final" ] || fail 'invalid cached runtime object'
  archive="$final/archive.tar.gz"
elif [ "$#" = 2 ]; then
  archive="$2"
else
  archive=
fi
if [ -n "$archive" ]; then
  [ ! -L "$archive" ] && [ -f "$archive" ] || fail 'archive must be a regular file'
  cp "$archive" "$snapshot"
else
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
    --connect-timeout 15 --max-time 120 --max-filesize 167772160 --retry 2 \
    --output "$snapshot" "$INSRC_RUNTIME_URL"
fi
. "$HERE/node-runtime-archive.sh"
insrc_extract_node_archive "$snapshot" "$stage/distribution" "$INSRC_RUNTIME_VERSION" "$target" "$INSRC_RUNTIME_SHA256"
runtime="$stage/distribution/$INSRC_RUNTIME_NODE"
if [ -e "$final" ]; then
  "$runtime" "$HERE/node-runtime-store.mjs" verify "$stage/distribution" "$final"
else
  "$runtime" "$HERE/node-runtime-store.mjs" publish "$stage" "$final"
  stage=
fi
printf '%s\n' "$final/distribution"
