#!/bin/bash
# Copyright (c) Procix Software India. Licensed under the MIT License.
# Internal extraction primitive. Identity arguments come from release-owned policy.
insrc_extract_node_archive() (
set -euo pipefail
umask 077
unset NODE_OPTIONS NODE_PATH
PATH=/usr/bin:/bin:/usr/sbin:/sbin
fail() { printf 'Node runtime archive: %s\n' "$*" >&2; exit 1; }
[ "$#" = 5 ] || fail 'expected ARCHIVE DESTINATION VERSION TARGET SHA256'
snapshot="$1"; destination="$2"; INSRC_RUNTIME_VERSION="$3"; target="$4"; INSRC_RUNTIME_SHA256="$5"
INSRC_RUNTIME_NODE=bin/node
INSRC_RUNTIME_NPM=lib/node_modules/npm/bin/npm-cli.js
[[ "$INSRC_RUNTIME_VERSION" =~ ^22\.[0-9]+\.[0-9]+$ ]] || fail 'invalid version'
case "$target" in darwin-arm64|darwin-x64|linux-arm64|linux-x64) ;; *) fail 'unsupported target' ;; esac
[[ "$INSRC_RUNTIME_SHA256" =~ ^[a-f0-9]{64}$ ]] || fail 'invalid digest'
[ ! -L "$snapshot" ] && [ -f "$snapshot" ] || fail 'archive must be regular'
[ ! -e "$destination" ] && [ ! -L "$destination" ] || fail 'destination must be new'
metadata=$(mktemp -d "${destination}.metadata-XXXXXXXX")
trap 'rm -rf -- "$metadata"' EXIT
[ "$(wc -c < "$snapshot" | tr -d ' ')" -le 167772160 ] || fail 'archive exceeds size limit'
if command -v shasum >/dev/null 2>&1; then
  actual=$(shasum -a 256 < "$snapshot")
else
  actual=$(sha256sum < "$snapshot")
fi
[ "${actual%% *}" = "$INSRC_RUNTIME_SHA256" ] || fail 'archive SHA-256 mismatch'
prefix="node-v$INSRC_RUNTIME_VERSION-$target"
# Before any executable is extracted or run, validate the entire pinned archive.
# Node distributions have only regular files/directories and these three bin links.
tar -tzf "$snapshot" > "$metadata/paths"
while IFS= read -r path; do
  case "$path" in "$prefix/"*) ;; *) fail 'archive has an unexpected root' ;; esac
  case "/${path%/}/" in *'/../'*|*'/./'*|*'//'*) fail 'archive has an unsafe path' ;; esac
  case "$path" in *'\'*|*$'\r'*|*$'\t'*) fail 'archive has an escaped or control path' ;; esac
done < "$metadata/paths"
tar -tvzf "$snapshot" > "$metadata/types"
while IFS= read -r entry; do
  case "$entry" in
    -*|d*) ;;
    l*" $prefix/bin/npm -> ../lib/node_modules/npm/bin/npm-cli.js") ;;
    l*" $prefix/bin/npx -> ../lib/node_modules/npm/bin/npx-cli.js") ;;
    l*" $prefix/bin/corepack -> ../lib/node_modules/corepack/dist/corepack.js") ;;
    *) fail 'archive has an unsupported entry or outside link' ;;
  esac
done < "$metadata/types"
mkdir "$destination"
tar -xzf "$snapshot" --no-same-owner --no-same-permissions --strip-components=1 -C "$destination"
runtime="$destination/$INSRC_RUNTIME_NODE"
npm="$destination/$INSRC_RUNTIME_NPM"
[ ! -L "$runtime" ] && [ -f "$runtime" ] && [ -x "$runtime" ] || fail 'Node executable is unavailable'
[ ! -L "$npm" ] && [ -f "$npm" ] && [ -f "$destination/LICENSE" ] || fail 'npm or license is unavailable'
[ "$("$runtime" -p 'process.versions.node')" = "$INSRC_RUNTIME_VERSION" ] || fail 'Node version mismatch'
[ "$("$runtime" -p 'process.platform + "-" + process.arch')" = "$target" ] || fail 'Node architecture mismatch'
PATH="$destination/bin:$PATH" "$runtime" "$npm" --version >/dev/null
)
