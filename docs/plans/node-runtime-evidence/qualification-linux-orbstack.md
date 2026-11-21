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
all normal lifecycle scripts. GPU/CUDA execution is not claimed. x64 remains
publicly disabled until its clean install, full build and native loads pass.

## Activation proof

Fresh installation using the promoted canonical packaged policy, daemon
start/status/restart/stop, exact kernel executable identities, bounded runtime
regressions and final cleanup are recorded below as they complete. No fixture
policy will substitute for this post-promotion installation proof.
