#!/bin/bash
# Copyright (c) Procix Software India. Licensed under the MIT License.
# Source into installed source-maintenance entrypoints. Bootstrap owns verification;
# selecting build tooling does not publish an activation binding.
insrc_source_toolchain() {
  local tools="$1" state="$2" distribution canonical recorded
  unset NODE_OPTIONS NODE_PATH
  [ -f "$tools/provision-node-runtime.sh" ] || { printf '%s\n' 'Runtime bootstrap assets are missing; reinstall using the matching packaged installer.' >&2; return 2; }
  distribution=$(/bin/bash "$tools/provision-node-runtime.sh" "$state") || return 2
  NODE_BIN="$distribution/bin/node"
  NPM_CLI="$distribution/lib/node_modules/npm/bin/npm-cli.js"
  if [ -n "${INSRC_NODE_BIN:-}" ]; then
    canonical=$("$NODE_BIN" -e 'process.stdout.write(require("fs").realpathSync(process.argv[1]))' "$INSRC_NODE_BIN" 2>/dev/null) || { printf '%s\n' 'External INSRC_NODE_BIN is unavailable; remove it and migrate to the owned runtime.' >&2; return 2; }
    [ "$canonical" = "$NODE_BIN" ] || { printf '%s\n' 'External INSRC_NODE_BIN is retired; remove it and use the verified installation-owned runtime.' >&2; return 2; }
  fi
  if [ -f "$state/daemon-node" ]; then
    recorded=$(cat "$state/daemon-node")
    canonical=$("$NODE_BIN" -e 'process.stdout.write(require("fs").realpathSync(process.argv[1]))' "$recorded" 2>/dev/null) || { printf '%s\n' 'The legacy daemon-node file is unavailable; migrate using the packaged installer.' >&2; return 2; }
    [ "$canonical" = "$NODE_BIN" ] || { printf '%s\n' 'The legacy daemon-node file selects an external runtime; migrate with the packaged installer.' >&2; return 2; }
  fi
  local object="${distribution%/*}"
  TOOLCHAIN_ID="$("$NODE_BIN" -p 'process.versions.node + ":" + process.platform + "-" + process.arch'):${object##*/}"
  export npm_config_target="${TOOLCHAIN_ID%%:*}" npm_config_runtime=node
  export PATH="$distribution/bin:${PATH:-/usr/bin:/bin}"
}
