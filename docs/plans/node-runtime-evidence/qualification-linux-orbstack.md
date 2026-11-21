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

Both public source targets are enabled only after their actual distribution,
install/build and native smoke passed. Fresh canonical packaged installers then
installed source commit `6a9ba7d4c` on both Linux machines, using empty private
homes and PATH `/usr/bin:/bin` without Node/npm. Invocations used `--repo` pointing
to the real repository's shared read-only Git source, `--branch v2`,
`--runtime-archive` pointing to the pinned official archive, `--embedder onnx`,
`--no-start -y`, and ONNXRUNTIME_NODE_INSTALL_CUDA=skip. There was no fixture-policy
substitution or copied macOS node_modules. The installer supplied the new Python
bytecode protection itself; the caller did not supply it.

Each real install completed npm install, the full canonical build, all five
native loads and one strict source binding. Public build receipts:

- arm64: `87b622c4-b181-4d34-beaf-771c901f369f`.
- x64: `9c3d07f2-926f-44de-88b1-d42a7e7d9a62`.

Both receipts report confirmedClosed:true. Full public installs needed 8 GB
memory limits on these 2-CPU test machines; earlier 4 GB runs hit the cgroup
memory limit. Failed candidate/cache evidence was retained without activation.

The real daemon CLI passed start/status/restart/stop on both machines. Direct
IPC status confirmed readiness and `/proc/<pid>/exe` matched the exact owned
Node distribution before and after restart. Arm64 PIDs changed 2353 to 2663;
x64 PIDs changed 6773 to 7437. Stop confirmed process exit and socket removal.
The actual CPU onnxruntime-node binding also loaded version1.21.0 on both.
Detailed actions, statuses, selected bindings and identities are in
`arm64-lifecycle-proof.json` and `x64-lifecycle-proof.json` in the retained Linux
evidence directory. These tests used empty test daemon state and no live LLM
requests; they do not claim model inference, CUDA or production database migration.

The existing source-runtime safety rule remains: installed updates without a
qualified staged migration refuse in-place mutation. This work enables and tests
fresh Linux source installation and its lifecycle; signed Linux release-bundle
trust/qualification is unchanged.


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


## Portable archive correction and bounded regression

The first x64 regression found that a macOS-produced installer carried hidden
AppleDouble files: BSD tar hid them from its own listing, while GNU tar exposed
extra members. The archive producer now disables copyfile metadata and xattrs.
A raw payload-header regression checks the exact regular-file set and rejects
xattr PAX records, and GNU tar independently verifies the final client asset
closure without warnings. No extra archive members were whitelisted.

Host run `b5926af9-6ecc-4fee-8b35-df092c073232` passed 30/30 tests without skips:
current IDE contracts, signed staging, policy, bootstrap, Python cache protection,
owned-runtime environments and coordinator controls. Final packaging run
`3a09431c-e0f8-4906-bccf-2d6600bd3066` passed all three packaging cases.

Linux arm64 run `40b8b70c-69d9-46fb-ada8-cf8843a5255b` passed all 19 applicable
cases, with two explicit Darwin-only skips. Linux x64 run
`12672471-6e20-4437-9757-80aa66303a81` passed 16, failed the archive-metadata
case described above and skipped the Darwin-only upgrade bridge. All its shell,
Python, bootstrap and store cases passed. Follow-up portable-packaging/Python
runs use the final producer and client assets and are recorded below.

Full source installs preceded the packaging-only metadata correction; the
canonical enabled policy, helper contents and native/runtime code were unchanged
by that correction. The final metadata-free packaged installer also verified
fresh bootstrap and offline reuse on both targets, including the already-bound
public installation caches after daemon shutdown. Native dependency installation
was not mocked or bypassed. This qualification does not claim a full repository
sweep, physical x86 hardware, IDE UI rendering, GPU execution or signed Linux
release qualification. Final human BUILD approval remains required.

Final Linux portable-packaging/Python regression runs each passed 4/4 with no
skips and confirmed actor closure:

- arm64: `c6529a9a-af6e-482f-8fb6-2b66a16589c2`.
- x64: `178de561-a8ad-4182-8281-e02784fb305f`.

These runs resolve the earlier x64 metadata failure using the final archive
producer and canonical client asset. `gnu-tar-portability.log` separately records
exact asset closure without metadata warnings. Final post-lifecycle reuse logs
verify both already-bound Node stores through the metadata-free installer.
`arm64-final-census.json` and `x64-final-census.json` record zero qualification
actors and zero active coordinator leases. Both qualification machines were then
stopped by explicit name; they remain available for inspection. OrbStack/Docker
and the user's installed macOS daemon were not restarted by this qualification.
All logs, source/public build receipts, test results, machine configuration and
process/binding proofs are retained in
`.insrc/tmp/node-runtime-qualification/linux/`.
