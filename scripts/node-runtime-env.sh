#!/bin/bash
# Copyright (c) Procix Software India. Licensed under the MIT License.
# Source into installed source-maintenance entrypoints. Bootstrap owns verification;
# selecting build tooling does not publish an activation binding.
insrc_source_toolchain() {
  local tools="$1" state="$2" distribution canonical recorded
  unset NODE_OPTIONS NODE_PATH
  [ -f "$tools/provision-node-runtime.sh" ] || { printf '%s\n' 'Runtime bootstrap assets are missing; reinstall using the matching packaged installer.' >&2; return 2; }
  local args=("$state")
  [ -z "${3:-}" ] || args+=("$3")
  distribution=$(/bin/bash "$tools/provision-node-runtime.sh" "${args[@]}") || return 2
  NODE_BIN="$distribution/bin/node"
  NPM_CLI="$distribution/lib/node_modules/npm/bin/npm-cli.js"
  if [ -n "${INSRC_NODE_BIN:-}" ] && [ "${4:-}" != bootstrap ]; then
    canonical=$("$NODE_BIN" -e 'process.stdout.write(require("fs").realpathSync(process.argv[1]))' "$INSRC_NODE_BIN" 2>/dev/null) || { printf '%s\n' 'External INSRC_NODE_BIN is unavailable; remove it and migrate to the owned runtime.' >&2; return 2; }
    [ "$canonical" = "$NODE_BIN" ] || { printf '%s\n' 'External INSRC_NODE_BIN is retired; remove it and use the verified installation-owned runtime.' >&2; return 2; }
  fi
  local bound=0 root binding
  root=$(cd "$tools/.." && pwd -P)
  binding=$("$NODE_BIN" -e 'const c=require("crypto");process.stdout.write(c.createHash("sha256").update(process.argv[1]).digest("hex"))' "$root")
  if [ -e "$state/source-runtimes/$binding.json" ] || [ -L "$state/source-runtimes/$binding.json" ]; then
    "$NODE_BIN" "$tools/node-runtime-store.mjs" binding "$state" "$root" "$distribution" || return 2
    bound=1
  fi
  SOURCE_RUNTIME_BOUND="$bound"
  if [ "$bound" -eq 0 ] && [ -f "$state/daemon-node" ] && [ "${4:-}" != migration ] && [ "${4:-}" != bootstrap ]; then
    recorded=$(/bin/cat "$state/daemon-node")
    canonical=$("$NODE_BIN" -e 'process.stdout.write(require("fs").realpathSync(process.argv[1]))' "$recorded" 2>/dev/null) || { printf '%s\n' 'The legacy daemon-node file is unavailable; rerun the packaged installer with --migrate-runtime.' >&2; return 2; }
    [ "$canonical" = "$NODE_BIN" ] || { printf '%s\n' 'The legacy daemon-node file selects an external runtime; rerun the packaged installer with --migrate-runtime.' >&2; return 2; }
  fi
  if [ -f "$state/daemon-node" ] && [ "${4:-}" = migration ]; then
    printf '%s\n' 'Staging owned-runtime migration; retaining the legacy daemon-node file for rollback.' >&2
  fi
  local object="${distribution%/*}"
  TOOLCHAIN_ID="$("$NODE_BIN" -p 'process.versions.node + ":" + process.platform + "-" + process.arch'):${object##*/}"
  # node-gyp imports Python modules bundled inside this immutable distribution.
  # Bytecode caches there would invalidate the archive-derived inventory.
  export PYTHONDONTWRITEBYTECODE=1
  export ONNXRUNTIME_NODE_INSTALL_CUDA="${ONNXRUNTIME_NODE_INSTALL_CUDA-skip}"
  export npm_config_target="${TOOLCHAIN_ID%%:*}" npm_config_runtime=node
  export PATH="$distribution/bin:${PATH:-/usr/bin:/bin}"
}
