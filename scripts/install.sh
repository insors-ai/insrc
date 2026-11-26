#!/bin/sh
# Release template. Publisher embeds exact target URLs/digests; never uses host Node.
set -eu
umask 077
fail() { printf '%s\n' "insrc: $*" >&2; exit 1; }
unset NODE_OPTIONS NODE_PATH
if [ "${ONNXRUNTIME_NODE_INSTALL_CUDA+x}" != x ]; then ONNXRUNTIME_NODE_INSTALL_CUDA=skip; export ONNXRUNTIME_NODE_INSTALL_CUDA; fi
for tool in uname mktemp mkdir chmod rm wc; do command -v "$tool" >/dev/null 2>&1 || fail "prerequisite missing: $tool (install it as your user)"; done
if command -v shasum >/dev/null 2>&1; then hash_kind=shasum
elif command -v sha256sum >/dev/null 2>&1; then hash_kind=sha256sum
else fail 'prerequisite missing: SHA-256 utility'; fi
case "$(uname -s)" in Darwin) os=darwin;; Linux) os=linux;; *) fail 'target unsupported';; esac
case "$(uname -m)" in arm64|aarch64) arch=arm64;; x86_64|amd64) arch=x64;; *) fail 'architecture unsupported';; esac
target="$os-$arch"
# @@TARGETS@@
[ -n "${runtime_url-}" ] || fail 'this source template has no qualified release assets; use a published installer'
home="${HOME:?}/.insrc"; identity=default; operation=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --home) [ "$#" -ge 2 ] || fail '--home requires value'; home=$2; shift 2;;
    --installation-id) [ "$#" -ge 2 ] || fail '--installation-id requires value'; identity=$2; shift 2;;
    --operation-id) [ "$#" -ge 2 ] || fail '--operation-id requires value'; operation=$2; shift 2;;
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
helper_active=0
cleanup() {
  if [ "$helper_active" -eq 1 ]; then printf '%s\n' "insrc: publication child exit unconfirmed; retained $stage" >&2
  else rm -rf "$stage"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
fetch() {
  command -v curl >/dev/null 2>&1 || fail 'prerequisite missing: curl (install it as your user)'
  case "$1" in https://*) ;; *) fail 'HTTPS asset required';; esac
  curl --fail --silent --show-error --location --max-redirs 8 --proto '=https' --proto-redir '=https' --connect-timeout 20 --max-time 600 --max-filesize "$3" "$1" -o "$2"
}
verify() {
  [ -f "$1" ] && [ ! -L "$1" ] || fail 'unsafe asset file'
  if [ "$hash_kind" = shasum ]; then actual=$(shasum -a 256 "$1"); else actual=$(sha256sum "$1"); fi
  actual=${actual%% *}; [ "$actual" = "$2" ] || fail 'asset digest mismatch'
}
verify_size() { count=$(wc -c < "$1"); [ "$count" -eq "$2" ] || fail 'asset size mismatch'; }
runtime_entry="$home/runtimes/22.22.1/$target-$baseline/$runtime_sha"
canonical_node="$runtime_entry/distribution/bin/node"
node=$canonical_node
if [ -e "$runtime_entry" ] || [ -L "$runtime_entry" ]; then
  verify "$node" "$node_sha"
else
  for tool in tar gzip; do command -v "$tool" >/dev/null 2>&1 || fail "prerequisite missing: $tool (install it as your user)"; done
  fetch "$runtime_url" "$stage/runtime.archive" "$runtime_bytes"
  verify_size "$stage/runtime.archive" "$runtime_bytes"; verify "$stage/runtime.archive" "$runtime_sha"
  # Execution stays in place. T4 publishes a separately extracted profile.
  mkdir -p "$stage/execution"
  tar -xzf "$stage/runtime.archive" -C "$stage/execution" "$runtime_root/bin/node" || fail 'runtime extraction failed'
  node="$stage/execution/$runtime_root/bin/node"
  verify "$node" "$node_sha"
fi
[ -x "$node" ] || fail 'runtime executable missing'
control="$home/install/bootstrap/$bootstrap_sha-$native_sha"
control_source=$control
if [ ! -e "$control" ] && [ ! -L "$control" ]; then
  control_source="$stage/control"
  mkdir -p "$control_source/native"
  fetch "$bootstrap_url" "$control_source/bootstrap.mjs" 16777216
  fetch "$native_url" "$control_source/native/control.node" 16777216
fi
verify "$control_source/bootstrap.mjs" "$bootstrap_sha"
verify "$control_source/native/control.node" "$native_sha"
# Unknown child exit retains the stage. This child publishes only the foundation.
helper_active=1
if
  :
  # @@PUBLISH_FOUNDATION@@
then helper_active=0
else helper_active=0; fail 'bootstrap publication failed'; fi
# Reaching here means the exact helper child exited. A native close return alone
# never substitutes for a fresh ordinary manager admission in the next process.
cleanup
trap - EXIT INT TERM HUP
set -- --home "$home" --installation-id "$identity"
if [ -n "$operation" ]; then set -- "$@" --operation-id "$operation"; fi
exec "$canonical_node" "$control/bootstrap.mjs" "$@"
