# Linux source runtime qualification on OrbStack

Story 175ab0d1d56838a9/s1, task t7, 2026-11-21. This extends the existing
approved runtime qualification task before final human BUILD approval.

## Linux arm64 prequalification

OrbStack machine `insrc-node-arm64` runs Ubuntu 24.04.5 LTS arm64 with glibc
2.39 and Linux `7.2.12-orbstack-00394-gbecdd6130068`. It has 2 CPUs and a 4 GB
memory limit. The host is Apple Silicon; arm64 execution is native. The new
machine initially had neither global Node nor npm. Installed prerequisites:
Git, curl, CA certificates, build-essential, Python3, pkg-config, libsecret-1-dev
and Perl. Source and all dependency/build output live on the Linux filesystem;
macOS native modules were not copied.

A clean clone of `58356628f` used an isolated enabled qualification policy while
public Linux targets remained disabled. The actual official archive SHA256 is
`1d1690e9aba47e887a275abc6d8f7317e571a0700deaef493f768377e99155f5`.
Real `npm ci` installed 679 packages, followed by full `npm run build` using the
canonical coordinator. Both commands used absolute owned Node22.22.1 and npm
10.9.4 paths, owned bin first on PATH, hostile Node/npm next, and CXXFLAGS C++17.
The observer recorded 30 lifecycle invocations using that same owned Node/npm.
The built smoke loaded tree-sitter, lmdb, fs-ext, LanceDB and DuckDB (ABI127).
Its build cleanup recorded `confirmedClosed: true`; no user databases were used.

The distribution is beneath the test machine's private
`/home/subhagho/insrc-node-qualification/home/.insrc/runtimes/` store.
Retained local evidence is in `.insrc/tmp/node-runtime-qualification/linux/` and
the machine's `~/insrc-node-qualification/`; full receipts will be copied before
stopping the machines.

## Linux x64 qualification status

`insrc-node-x64` is a separate Ubuntu24.04 amd64 OrbStack machine, executing x64
userland through emulation on Apple Silicon. This is not physical x86 hardware
or signed Linux release-bundle qualification. The initial 4 GB test limit hit a
parser-generator memory limit; the retry has 8 GB and 2 CPUs.

The initial real npm install also exposed the locked ONNX dependency's optional
CUDA download returning HTTP404. CPU qualification uses its supported
`ONNXRUNTIME_NODE_INSTALL_CUDA=skip` option, which retains CPU ONNX Runtime and
all normal lifecycle scripts. GPU/CUDA execution is not claimed. The retry passed a clean npm ci, full canonical build and all five native loads
under actual Node22.22.1/npm10.9.4. The archive SHA256 is
`07c8aafa60644fb81adefa1ee7da860eb1920851ffdc9a37020ab0be47fbc10e`.
The observer recorded 58 lifecycle invocations across retries; all used the exact
owned Node/npm paths. Only successful runs qualify target enablement.

## Activation proof

Fresh installation using the promoted canonical packaged policy, daemon
start/status/restart/stop, exact kernel executable identities, bounded runtime
regressions and final cleanup are recorded below as they complete. No fixture
policy will substitute for this post-promotion installation proof.


## Immutable toolchain correction

The first public arm64 install completed install/build/native loading, but
binding correctly failed: node-gyp's Python imports wrote 13 new __pycache__
entries into the verified npm distribution. Activation was withheld. The changed
cache and inventory diff are retained; no inventory entries were ignored and no
cached inventory was rewritten to accept those bytes.

The existing shell owner and shared ownedNodeEnvironment now set
PYTHONDONTWRITEBYTECODE=1. A regression imports actual gyp Python modules from the
official npm distribution through both shell and TUI environments, then proves
archive-derived cache verification still succeeds. Run
`b5a91797-613d-4894-ad1d-f7dc5d7d9a3a` passed this test, runtime adapter, policy and
public packaging tests with confirmed closure. Both Linux machines separately
passed actual Python-import plus fresh cache verification and five native loads
under the corrected environment. Only unselected qualification caches were
quarantined, after all their processes closed; no production runtime was deleted.
The existing LLD ownership model and strict immutable-inventory contract remain
unchanged. Fresh canonical installer retries below carry this correction.
