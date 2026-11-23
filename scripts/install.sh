#!/bin/sh
# Release template. Publisher embeds exact target URLs/digests; never uses host Node.
set -eu
umask 077
fail() { printf '%s\n' "insrc: $*" >&2; exit 1; }
unset NODE_OPTIONS NODE_PATH
if [ "${ONNXRUNTIME_NODE_INSTALL_CUDA+x}" != x ]; then ONNXRUNTIME_NODE_INSTALL_CUDA=skip; export ONNXRUNTIME_NODE_INSTALL_CUDA; fi
for tool in uname curl tar gzip mktemp mkdir chmod rm; do command -v "$tool" >/dev/null 2>&1 || fail "prerequisite missing: $tool (install it as your user)"; done
if command -v shasum >/dev/null 2>&1; then hash_kind=shasum
elif command -v sha256sum >/dev/null 2>&1; then hash_kind=sha256sum
else fail 'prerequisite missing: SHA-256 utility'; fi
case "$(uname -s)" in Darwin) os=darwin;; Linux) os=linux;; *) fail 'target unsupported';; esac
case "$(uname -m)" in arm64|aarch64) arch=arm64;; x86_64|amd64) arch=x64;; *) fail 'architecture unsupported';; esac
target="$os-$arch"
# @@TARGETS@@
[ -n "${runtime_url-}" ] || fail 'this source template has no qualified release assets; use a published installer'
home="${HOME:?}/.insrc"; identity=default
while [ "$#" -gt 0 ]; do
  case "$1" in
    --home) [ "$#" -ge 2 ] || fail '--home requires value'; home=$2; shift 2;;
    --installation-id) [ "$#" -ge 2 ] || fail '--installation-id requires value'; identity=$2; shift 2;;
    *) fail "unsupported argument: $1";;
  esac
done
case "$home" in /*) ;; *) fail 'home must be absolute';; esac
case "$home/" in *'/../'*|*'/./'*|//* ) fail 'unsafe home';; esac
current=$home
while :; do [ ! -L "$current" ] || fail 'home ancestor is a symlink'; [ "$current" != / ] || break; current=${current%/*}; [ -n "$current" ] || current=/; done
mkdir -p "$home/install"
[ ! -L "$home/install" ] || fail 'control root is a symlink'
chmod 700 "$home/install"
stage=$(mktemp -d "$home/install/bootstrap-stage.XXXXXXXX")
cleanup() { rm -rf "$stage"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
fetch() { case "$1" in https://*) ;; *) fail 'HTTPS asset required';; esac; curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 20 --max-time 600 --max-filesize 104857600 "$1" -o "$2"; }
verify() {
  if [ "$hash_kind" = shasum ]; then actual=$(shasum -a 256 "$1"); else actual=$(sha256sum "$1"); fi
  actual=${actual%% *}; [ "$actual" = "$2" ] || fail 'asset digest mismatch'
}
fetch "$runtime_url" "$stage/runtime.tar.gz"; verify "$stage/runtime.tar.gz" "$runtime_sha"
# The official, digest-bound archive is trusted only after verify. Extract exact
# regular-file subtrees; skip npm/npx/corepack command aliases.
tar -xzf "$stage/runtime.tar.gz" -C "$stage" "$runtime_root/bin/node" "$runtime_root/lib/node_modules/npm" "$runtime_root/include/node" "$runtime_root/LICENSE" || fail 'runtime extraction failed'
node="$stage/$runtime_root/bin/node"
[ -x "$node" ] && [ ! -L "$node" ] || fail 'runtime executable missing'
# @@PUBLISH_RUNTIME@@
node="$home/runtimes/22.22.1/$target/bin/node"
mkdir -p "$stage/control/native"
fetch "$bootstrap_url" "$stage/control/bootstrap.mjs"; verify "$stage/control/bootstrap.mjs" "$bootstrap_sha"
fetch "$native_url" "$stage/control/native/control.node"; verify "$stage/control/native/control.node" "$native_sha"
control="$home/install/bootstrap/$bootstrap_sha-$native_sha"
# @@PUBLISH_CONTROL@@
# Keep terminal I/O and status. Selected runtime/control code is immutable.
"$node" "$control/bootstrap.mjs" --home "$home" --installation-id "$identity"
