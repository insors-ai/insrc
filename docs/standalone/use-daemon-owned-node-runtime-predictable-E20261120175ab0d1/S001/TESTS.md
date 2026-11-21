<!-- insrc:artifact TESTS-175ab0d1d56838a9-s1 -->

# Tests: 175ab0d1d56838a9 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 78 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-21T04:49:50.725Z on commit `f1f37d6e1`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Policy/version/target/digest validation and generated asset/release-pin parity; unsupported target rejection**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | pins candidate Node distributions to the authenticated checksum inventory | `scripts/__tests__/node-runtime-policy.test.ts` |
| pass | rejects malformed version target URL digest layout and qualification policy | `scripts/__tests__/node-runtime-policy.test.ts` |
| pass | rejects unsupported and unqualified public targets without an environment bypass | `scripts/__tests__/node-runtime-policy.test.ts` |
| pass | keeps generated client assets signed release pins and native headers aligned | `scripts/__tests__/node-runtime-policy.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/node-runtime-policy.test.ts` | 0 | 4 | 0.7 s |  |

## t2

Run at 2026-11-21T05:05:56.061Z on commit `cc4cf5245`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Archive digest/traversal/link/device/version rejection, cached inventory corruption, publication locking and owned cleanup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | rejects digest traversal links devices and runtime identity before publication | `scripts/__tests__/node-runtime-store.test.ts` |
| pass | rejects cache corruption even when its cached inventory is rewritten | `scripts/__tests__/node-runtime-store.test.ts` |
| pass | serializes concurrent publication and removes only owned failed stages | `scripts/__tests__/node-runtime-store.test.ts` |
| pass | publishes one canonical binding and refuses escaping or unqualified roots | `scripts/__tests__/node-runtime-store.test.ts` |

**integration: Node-free bootstrap, offline verified reuse, concurrent/interrupted provisioning in disposable HOME**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bootstraps without PATH Node and reuses a verified cache offline | `scripts/__tests__/node-runtime-store.test.ts` |
| pass | serializes concurrent publication and removes only owned failed stages | `scripts/__tests__/node-runtime-store.test.ts` |
| pass | retries incomplete provisioning without selecting or deleting an unrelated stage | `scripts/__tests__/node-runtime-store.test.ts` |
| pass | cleans an actually interrupted bootstrap and retries without publishing partial state | `scripts/__tests__/node-runtime-store.test.ts` |
| pass | bootstraps the official archive in an empty HOME without PATH Node or npm | `scripts/__tests__/node-runtime-bootstrap-native.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/node-runtime-bootstrap-native.test.ts` | 0 | 1 | 9.1 s |  |
| `scripts/__tests__/node-runtime-store.test.ts` | 0 | 7 | 7.2 s |  |

## t3

Run at 2026-11-21T05:44:00.856Z on commit `8a5b05dbd`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Shell installer/control/bridge actual child identity with absent/20/26/fake Node/npm, sanitized injection environment and quoted paths**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | shell fresh install update and restart preflight use official owned Node despite ambient Node and npm | `scripts/__tests__/node-runtime-shell-native.test.ts` |
| pass | shell legacy upgrade bridge uses the same official Node and npm before managed delegation | `scripts/__tests__/node-runtime-shell-native.test.ts` |
| pass | fresh installer uses official Node with absent Node and ambient Node20 or Node26 | `scripts/__tests__/node-runtime-shell-native.test.ts` |
| pass | successful restart retains actual official helper and daemon child identity across the runtime matrix | `scripts/__tests__/node-runtime-shell-native.test.ts` |

**unit: Extend src/daemon/__tests__/daemon-ctl-node-path.test.ts and src/cli/services/__tests__/daemon-ctl-install-marker.test.ts for owned selection and lock+toolchain marker failures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | daemon-ctl.sh accepts matching owned INSRC_NODE_BIN with no PATH Node | `src/daemon/__tests__/daemon-ctl-node-path.test.ts` |
| pass | daemon-ctl.sh refuses an external recorded runtime even when PATH contains Node | `src/daemon/__tests__/daemon-ctl-node-path.test.ts` |
| pass | daemon-ctl.sh honours a non-executable INSRC_NODE_BIN by failing closed, not by echoing it | `src/daemon/__tests__/daemon-ctl-node-path.test.ts` |
| pass | S001 t2: daemon-ctl.sh update retries after a failed install (exit 4), then skips on a matching marker | `src/cli/services/__tests__/daemon-ctl-install-marker.test.ts` |
| pass | owned marker includes lock and toolchain and rejects the old lock-only format | `src/cli/services/__tests__/daemon-ctl-install-marker.test.ts` |
| pass | S001 t2: daemon-ctl.sh installs on a stale or missing marker, with -std=c++17 appended to CXXFLAGS | `src/cli/services/__tests__/daemon-ctl-install-marker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/node-runtime-shell-native.test.ts` | 0 | 4 | 115.6 s |  |
| `src/cli/services/__tests__/daemon-ctl-install-marker.test.ts` | 0 | 4 | 3.3 s |  |
| `src/daemon/__tests__/daemon-ctl-node-path.test.ts` | 0 | 9 | 12.2 s |  |

## t4

Run at 2026-11-21T06:19:50.238Z on commit `30204dfba`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Installed TUI/MCP wrappers and daemon start record owned executable; TUI update uses absolute npm-cli and lifecycle child version**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | installed TUI and MCP symlink wrappers use official owned Node under absent and hostile PATH | `scripts/__tests__/node-runtime-cli-native.test.ts` |
| pass | TUI update runs absolute official npm and lifecycle Node with the shared shell marker | `scripts/__tests__/node-runtime-cli-native.test.ts` |
| pass | TUI daemon start retains actual owned child identity and fails closed on corrupt runtime | `scripts/__tests__/node-runtime-cli-native.test.ts` |
| pass | packaged launchers verify retained signed runtime before executing tools Node | `scripts/__tests__/node-runtime-cli-native.test.ts` |

**unit: Extend src/cli/services/__tests__/maintenance-install-marker.test.ts and managed start/error fixtures; preserve nativeBuildEnv flags**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | owned runtime adapter consumes shell authority and rejects invalid metadata without global fallback | `src/cli/services/__tests__/owned-runtime.test.ts` |
| pass | owned runtime and native build environments preserve caller flags while removing Node injection | `src/cli/services/__tests__/owned-runtime.test.ts` |
| pass | S001 t1: an update after a failed install installs again, and the marker exists only after a successful install | `src/cli/services/__tests__/maintenance-install-marker.test.ts` |
| pass | S001 t1: a matching marker skips the install; a stale or missing marker installs | `src/cli/services/__tests__/maintenance-install-marker.test.ts` |
| pass | S001 t1: npm runs with -std=c++17 appended to the caller's CXXFLAGS | `src/cli/services/__tests__/maintenance-install-marker.test.ts` |
| pass | Normal CLI and shell restart | `src/cli/services/__tests__/managed-daemon-control.test.ts` |
| pass | Installed shell restart sends one stop and one start bound to the same predecessor | `src/cli/services/__tests__/managed-daemon-control.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/node-runtime-cli-native.test.ts` | 0 | 4 | 83.6 s |  |
| `src/cli/services/__tests__/maintenance-install-marker.test.ts` | 0 | 5 | 3.6 s |  |
| `src/cli/services/__tests__/managed-daemon-control.test.ts` | 0 | 7 | 5.5 s |  |
| `src/cli/services/__tests__/owned-runtime.test.ts` | 0 | 2 | 0.5 s |  |

## t5

Run at 2026-11-21T06:54:45.253Z on commit `39095297c`. Tests check: **passed**. 14 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Extend VS Code controller/commands and JetBrains NodeRuntimeResolverTest/PrivateNodeProvisionerTest for shared local policy and no host runtime selection**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | JetBrains never probes host Node and delegates verified provisioning including cache reuse and failures | `jetbrains-plugin/__tests__/node-runtime-gradle.test.ts` |
| pass | JetBrains script provisioner and managed command runner contracts remain passing | `jetbrains-plugin/__tests__/node-runtime-gradle.test.ts` |
| pass | JetBrains MCP registration selects the owned-runtime shell wrapper and preserves project scope | `jetbrains-plugin/__tests__/node-runtime-gradle.test.ts` |
| pass | VS Code lifecycle subprocesses strip Node injection and preserve other environment flags | `vscode-plugin/src/daemon/__tests__/runtime-boundary.test.ts` |
| pass | VS Code daemon commands delegate install and lifecycle through fixed shell and surface owned-runtime failures | `vscode-plugin/src/daemon/__tests__/commands.test.ts` |
| pass | run(action) spawns bash <ctlScript> <action> for each lifecycle action and derives state from reachability on exit 0 | `vscode-plugin/src/daemon/__tests__/controller.test.ts` |
| pass | composeMcpEntry(path) = { command:/bin/bash, args:[path] } and returns undefined for an undefined/empty target (no cloud/env/argv) | `vscode-plugin/src/hosts/__tests__/writers.test.ts` |

**integration: Packaged installer/bootstrap policy consistency and existing signed staging/fingerprint verification regression**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | packaged installer embeds exactly the canonical shared runtime assets and detects drift | `scripts/__tests__/node-runtime-packaging.test.ts` |
| pass | standalone packaged installer bootstraps official Node without global Node or adjacent files | `scripts/__tests__/node-runtime-packaging.test.ts` |
| pass | IDE-composed MCP registration executes the official owned runtime wrapper and preserves caller cwd | `scripts/__tests__/node-runtime-packaging.test.ts` |
| pass | candidate layout survives moving the runtime and rejects external links | `scripts/__tests__/package-daemon-candidate.test.ts` |
| pass | staging authenticates archive bytes and rejects links leaving the runtime | `scripts/__tests__/stage-daemon-bundle.test.ts` |
| pass | installed trust rejects a self-signed proof and recovery selects only the pinned runtime | `scripts/__tests__/daemon-bundle-metadata.test.ts` |
| pass | bundle signatures bind raw bytes, signer, trust domain and supported target | `scripts/__tests__/daemon-bundle-metadata.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/__tests__/node-runtime-gradle.test.ts` | 0 | 3 | 5.5 s |  |
| `scripts/__tests__/daemon-bundle-metadata.test.ts` | 0 | 6 | 0.5 s |  |
| `scripts/__tests__/node-runtime-packaging.test.ts` | 0 | 3 | 20.7 s |  |
| `scripts/__tests__/package-daemon-candidate.test.ts` | 0 | 3 | 0.6 s |  |
| `scripts/__tests__/stage-daemon-bundle.test.ts` | 0 | 1 | 0.5 s |  |
| `vscode-plugin/src/daemon/__tests__/commands.test.ts` | 0 | 6 | 0.3 s |  |
| `vscode-plugin/src/daemon/__tests__/controller.test.ts` | 0 | 9 | 0.3 s |  |
| `vscode-plugin/src/daemon/__tests__/runtime-boundary.test.ts` | 0 | 1 | 0.3 s |  |
| `vscode-plugin/src/hosts/__tests__/writers.test.ts` | 0 | 19 | 0.3 s |  |

## t6

Run at 2026-11-21T07:45:34.424Z on commit `b6aabd15a`. Tests check: **passed**. 16 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Stage install/native/build failure before activation; binding/journal interruption retry and managed rollback retain previous selection**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | actual owned source staging retains legacy selection on native failure and binds only the ready candidate | `scripts/__tests__/node-runtime-migration-native.test.ts` |
| pass | selected source shell and TUI updates refuse in-place mutation and retain the ready binding | `scripts/__tests__/node-runtime-migration-native.test.ts` |
| pass | installer refuses an existing non-Darwin source tree before lockfile dependencies or database bytes can change | `scripts/__tests__/node-runtime-migration-native.test.ts` |
| pass | Owned toolchain staging failures preserve prior selection binding and executable bytes | `src/daemon/__tests__/managed-release-staging.test.ts` |
| pass | Staging leaves the installed release executable and unchanged | `src/daemon/__tests__/managed-release-staging.test.ts` |
| pass | First supported update of a qualified prior build with broker denial | `src/daemon/__tests__/managed-release-staging.test.ts` |
| pass | binding interruption preserves the old record and selected runtime without deleting referenced objects | `scripts/__tests__/node-runtime-store.test.ts` |
| pass | Relaunch supervisor after provisional release selection and verify recovery restores the old selector before uncommitted rollback, or preserves the candidate after success | `src/daemon/__tests__/managed-update-transaction.test.ts` |
| pass | Bundle rollback leaves the selector untouched when the predecessor cannot be verified | `src/daemon/__tests__/managed-update-transaction.test.ts` |

**unit: Old marker migration, external override diagnostics, no database rewrite or deletion of referenced runtime**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | owned marker includes lock and toolchain and rejects the old lock-only format | `src/cli/services/__tests__/daemon-ctl-install-marker.test.ts` |
| pass | external INSRC_NODE_BIN is rejected with migration guidance | `src/daemon/__tests__/daemon-ctl-node-path.test.ts` |
| pass | source binding consumption rejects changed metadata and escaping directories | `scripts/__tests__/node-runtime-store.test.ts` |
| pass | stopped legacy migration retains the recorded prior runtime rather than inheriting the new bootstrap runtime | `src/daemon/__tests__/legacy-runtime-record.test.ts` |
| pass | unknown malformed or mutable legacy runtime records withhold migration without guessing a global Node | `src/daemon/__tests__/legacy-runtime-record.test.ts` |
| pass | First supported update of a qualified prior build with broker denial | `src/daemon/__tests__/managed-release-staging.test.ts` |
| pass | installer refuses an existing non-Darwin source tree before lockfile dependencies or database bytes can change | `scripts/__tests__/node-runtime-migration-native.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/node-runtime-migration-native.test.ts` | 0 | 3 | 41.3 s |  |
| `scripts/__tests__/node-runtime-store.test.ts` | 0 | 9 | 7.7 s |  |
| `src/cli/services/__tests__/daemon-ctl-install-marker.test.ts` | 0 | 5 | 4.2 s |  |
| `src/daemon/__tests__/daemon-ctl-node-path.test.ts` | 0 | 10 | 12.8 s |  |
| `src/daemon/__tests__/legacy-runtime-record.test.ts` | 0 | 2 | 0.5 s |  |
| `src/daemon/__tests__/managed-release-staging.test.ts` | 0 | 7 | 17.3 s |  |
| `src/daemon/__tests__/managed-update-transaction.test.ts` | 0 | 12 | 9.3 s |  |

## t7

Run at 2026-11-21T13:30:19.697Z on commit `71446ab78`. Tests check: **passed**. 14 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**smoke: Actual official Node22.22.1/npm, npm lifecycle child paths, npm install/build and native module load per enabled target**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/node-runtime-evidence/qualification-darwin-arm64.md and docs/plans/node-runtime-evidence/qualification-linux-orbstack.md; retained .insrc/tmp/node-runtime-qualification/{prequalification,public-policy,linux}/. Enabled darwin-arm64 plus linux-arm64/linux-x64. Both OrbStack Ubuntu24.04 Linux targets passed real clean npm installs/full builds, five native loads, actual canonical enabled-policy source installation, CPU ONNX binding load, real daemon start/status/restart/stop with kernel executable verification and final zero-actor/zero-lease census. Linux x64 is emulated; CPU installs use documented ONNXRUNTIME_NODE_INSTALL_CUDA=skip. Final portable-packaging/Python tests passed 4/4 on both machines; machines are stopped. No signed Linux bundle, physical x86, CUDA, inference, full sweep or production DB migration claim. Automatic default follow-up: docs/plans/node-runtime-evidence/qualification-linux-orbstack.md, canonical run 0d6c3891-65fc-4986-9783-068375d88642 and .insrc/tmp/node-runtime-qualification/linux/x64-cuda-default-proof.log. No caller CUDA setting; the shell supplied skip, both real ONNX 1.21.0/1.19.2 postinstall scripts succeeded, CPU binding loaded and archive verification passed. Explicit existing environment values remain preserved.

**integration: Canonical bounded regression and IDE build suites; signed managed recovery/rollback; no active owned test children after cleanup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | keeps generated client assets signed release pins and native headers aligned | `scripts/__tests__/node-runtime-policy.test.ts` |
| pass | standalone packaged installer bootstraps official Node without global Node or adjacent files | `scripts/__tests__/node-runtime-packaging.test.ts` |
| pass | packaged installer embeds exactly the canonical shared runtime assets and detects drift | `scripts/__tests__/node-runtime-packaging.test.ts` |
| pass | native Python imports leave the owned npm distribution byte-for-byte reusable through shell and TUI environments | `scripts/__tests__/node-runtime-python-native.test.ts` |
| pass | owned runtime and native build environments preserve caller flags while removing Node injection | `src/cli/services/__tests__/owned-runtime.test.ts` |
| pass | verified owned Node runs coordinator ownership interruption and actor-closure controls regardless of the parent runtime | `scripts/__tests__/node-runtime-coordinator-native.test.ts` |
| pass | the bundled installer embeds canonical runtime assets without template drift | `vscode-plugin/src/daemon/__tests__/bundle.test.ts` |
| pass | extension.ts constructs the AiHostRegistry (HostSpecs + real HostEnv/HostFileSystem) and calls registerHostCommands with the s1 surfaces | `vscode-plugin/src/hosts/__tests__/activation.test.ts` |
| pass | JetBrains script provisioner and managed command runner contracts remain passing | `jetbrains-plugin/__tests__/node-runtime-gradle.test.ts` |
| pass | JetBrains MCP registration selects the owned-runtime shell wrapper and preserves project scope | `jetbrains-plugin/__tests__/node-runtime-gradle.test.ts` |
| pass | Relaunch supervisor after provisional release selection and verify recovery restores the old selector before uncommitted rollback, or preserves the candidate after success | `src/daemon/__tests__/managed-update-transaction.test.ts` |
| pass | Bundle rollback leaves the selector untouched when the predecessor cannot be verified | `src/daemon/__tests__/managed-update-transaction.test.ts` |
| pass | owned builds default optional ONNX CUDA installation to skip only when absent | `src/cli/services/__tests__/owned-runtime.test.ts` |
| pass | shell and TUI npm lifecycle children default ONNX CUDA to skip while retaining explicit environment values | `scripts/__tests__/node-runtime-python-native.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/__tests__/node-runtime-gradle.test.ts` | 0 | 3 | 9.8 s |  |
| `scripts/__tests__/node-runtime-coordinator-native.test.ts` | 0 | 1 | 11.9 s |  |
| `scripts/__tests__/node-runtime-packaging.test.ts` | 0 | 3 | 17.4 s |  |
| `scripts/__tests__/node-runtime-policy.test.ts` | 0 | 4 | 0.5 s |  |
| `scripts/__tests__/node-runtime-python-native.test.ts` | 0 | 2 | 39.1 s |  |
| `src/cli/services/__tests__/owned-runtime.test.ts` | 0 | 3 | 0.8 s |  |
| `src/daemon/__tests__/managed-update-transaction.test.ts` | 0 | 12 | 10.1 s |  |
| `vscode-plugin/src/daemon/__tests__/bundle.test.ts` | 0 | 4 | 0.4 s |  |
| `vscode-plugin/src/hosts/__tests__/activation.test.ts` | 0 | 4 | 0.3 s |  |
