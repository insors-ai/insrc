<!-- insrc:artifact LLD-175ab0d1d56838a9-s1 -->

# LLD: STORY-175ab0d1d56838a9-s1 — Use a daemon-owned Node runtime for predictable installation build and launch

## Summary

**Epic:** `use-daemon-owned-node-runtime-predictable`
**HLD base run:** `wf-1795235086264-abn2jy`
**HLD effective hash:** `89a91b114ba5...`

Install and reuse a verified local Node 22.22.1 distribution with its bundled npm, so daemon installation, updates and launch do not depend on shell or IDE Node versions. Keep signed managed releases bound to their existing runtime fingerprint and lifecycle owner. Bootstrap and migration complete validation before activation; failed provisioning leaves the running installation intact.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `startDaemon`

```typescript
startDaemon(): Promise<StartResult>
```

**Returns:** `Promise<StartResult>` — Existing result shape; successful legacy start uses verified installation-owned Node, managed start delegates to the existing managed controller.

**Errors:**
- `StartResult failure` when Runtime absent, corrupt, unsupported or ownership mismatch; return actionable reinstall/repair diagnostic without system fallback.

**Preconditions:**
- Resolve and verify selected installation/runtime before any launch; no process.execPath inheritance for installed daemon.

**Postconditions:**
- Daemon executable and helpers are absolute verified installation-owned paths. No global Node mutation or lifecycle gate bypass.

### 2.2 `nativeBuildEnv`

```typescript
nativeBuildEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv
```

**Parameters:**
- `env: NodeJS.ProcessEnv` _(optional)_ — Parent environment to sanitize for native builds.

**Returns:** `NodeJS.ProcessEnv` — Retain existing C++17 behavior. Runtime-aware callers augment with verified toolchain bin first on PATH and matching npm metadata; this function alone is not runtime authority.

**Preconditions:**
- Installer/update has selected a verified local toolchain.

**Postconditions:**
- No inherited NODE_OPTIONS or NODE_PATH can inject bootstrap/build code; required native build flags preserved.

## 3. Data model changes

### 3.1 `Pinned runtime policy (proposed release-owned record)` — new

Single canonical policy: schemaVersion1, exactNodeVersion22.22.1, target, fixed HTTPS archive URL, archive SHA256 and expected layout. Publish initial source-toolchain targets darwin-arm64, darwin-x64, linux-x64 and linux-arm64 only after checksum and smoke validation; unknown targets including Windows fail explicitly rather than select system Node. This does not expand qualified managed-release platform support. Official full Node archives include matching npm; pin actual per-target digests in trusted project/release assets, never fetch a checksum next to an untrusted download and call it independent verification. Bootstrap shell/assets and Kotlin adapters are generated/checked against this canonical policy. Runtime upgrades require explicit policy/native/release qualification changes.

**Call sites:**
- `scripts/insrc-daemon-install.sh`
- `scripts/daemon-ctl.sh`
- `scripts/package-daemon-bootstrap.mjs`
- `scripts/daemon-bundle-metadata.mjs`
- `scripts/linux-daemon-metadata.mjs`

### 3.2 `Installation-owned source toolchain (proposed local record)` — new

One installation binding points to exactly one verified full distribution under stateRoot/runtimes/node-v22.22.1-<target>/<archiveDigest>/; several source installs may reference that immutable store object. Store owns Node bin/node, npm lib/node_modules/npm/bin/npm-cli.js, licenses and complete verified inventory; binding records policy/target/digest/canonical root. Do not trust the presence of node or a success marker. Bootstrap in shell with standard downloader/hash/tar tools, requiring no Node/npm; verify fixed digest before extraction, reject traversal/outside links/devices, verify version/arch and npm, stage with private permissions beside final path, lock publication and atomically rename after inventory verification. Verify cached bytes against inventory derived from trusted archive on reuse, reject symlinked roots or changed files. Reuse verified offline; interrupted download/staging never becomes selected.

**Call sites:**
- `scripts/insrc-daemon-install.sh`
- `scripts/daemon-ctl.sh`
- `src/cli/services/maintenance.ts`

### 3.3 `Source installation execution environment` — invariant-change

All installer/upgrade bridge Node invocations, shell control, TUI maintenance and installed MCP/TUI launcher paths select the bound toolchain; invoke npm as absolute node plus absolute npm-cli.js and set distribution bin first on PATH for npm lifecycle/child node. Preserve non-Node PATH tools and CXXFLAGS; sanitize NODE_OPTIONS/NODE_PATH at owned boundaries. Explicit INSRC_NODE_BIN is accepted only if canonical executable equals the selected verified owned runtime; arbitrary external override and old daemon-node external paths produce migration diagnostics, never silent fallback. Existing install-marker validity additionally includes toolchain identity and native target alongside lock hash, so a runtime migration forces reinstall/rebuild even when lockfile matches; failed install removes success marker. Packaged client assets must contain matching bootstrap policy.

**Call sites:**
- `scripts/insrc-daemon-install.sh`
- `scripts/daemon-ctl.sh`
- `src/cli/services/daemon.ts`
- `src/cli/services/maintenance.ts`

### 3.4 `Managed release runtime ownership` — invariant-change

Existing installation descriptor points to one selected release and its signed tools/node; release manifest/fingerprint remains authoritative. Source cache is bootstrap/build tooling, never a replacement for managed runtime. Preserve recovery, trust domains, release floor, admission and rollback verification; do not mutate existing signed bytes or add npm to an already signed release. New bootstrap packaging may carry the full verified Node/npm toolchain as a newly authenticated artifact; existing daemon bundles need no npm expansion. Managed lifecycle operations continue through existing controller, not direct legacy spawn. Pin metadata must agree with canonical policy, with drift failing packaging/CI.

**Call sites:**
- `scripts/install-daemon-bundle.mjs`
- `scripts/package-daemon-bootstrap.mjs`
- `scripts/daemon-bundle-metadata.mjs`
- `scripts/linux-daemon-metadata.mjs`

### 3.5 `Current client runtime resolution` — invariant-change

VS Code and JetBrains installation/control paths delegate to the shared shell/bootstrap runtime owner; JetBrains DefaultNodeRuntimeResolver no longer chooses system>=20 or separately downloads20.18.0. Reuse its injectable probe/download/extract test seams only as adapters to the same pin/digest/store rules, with one provisioning authority per target operation. IDE host runtime remains host-owned; it cannot become daemon runtime. Installed TUI/MCP executable wrappers use owned Node; developer npm/tsx sessions remain explicit development entry points and are not re-executed unexpectedly. All clients preserve existing IPC names and payloads; no compatibility work for deprecated insrc-ide.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultNodeRuntimeResolver.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultPrivateNodeProvisioner.kt`
- `src/cli/services/daemon.ts`

## 4. Diagrams

- [Component dependencies](docs/standalone/use-daemon-owned-node-runtime-predictable-E20261120175ab0d1/S001/component-dependency.html)

## 5. Error paths

**Error cases**

- **No cached runtime and network/download unavailable** (recoverable)
  - Detection: Bounded downloader timeout/status or missing bootstrap prerequisite.
  - Response: Abort provisioning with target, pin and retry/repair instructions; remove only owned temporary stage.
  - User impact: Install/update cannot proceed; existing daemon and selected release remain available.
- **Archive or cached runtime corrupt, wrong target/version or escaped extraction** (recoverable)
  - Detection: Trusted digest, bounded archive/path/link validation, inventory recheck and executable version/architecture probe.
  - Response: Fail closed before executing npm/Node from unverified content. Quarantine only owned invalid cache entry when safe; never follow external links or delete another active runtime.
  - User impact: Repair requires a valid trusted archive; no system fallback.
- **Unsupported platform or missing target policy** (terminal)
  - Detection: Normalize OS/architecture and require exact allowlisted policy entry.
  - Response: Report unsupported source-toolchain target; do not claim managed qualification or invoke systemNode.
  - User impact: No new installation on unsupported target.
- **Concurrent or interrupted provisioning** (recoverable)
  - Detection: Per-runtime publication lock, unique temporary stage, existing verified final directory.
  - Response: Bound wait; verify winner; clean own stage. Stale-lock recovery must prove owner gone using existing platform-safe primitives; otherwise report busy.
  - User impact: Safe retry without partial publication or global changes.
- **Native install/build fails during migration** (recoverable)
  - Detection: Nonzero npm/build result, toolchain mismatch or missing native smoke proof.
  - Response: Invalidate candidate success marker, retain old selected installation, report log; do not stop or activate a replacement.
  - User impact: Current daemon remains selected; retry after correcting failure.
- **Managed descriptor or signed fingerprint mismatch** (recoverable)
  - Detection: Existing managed read/verification and recovery checks fail.
  - Response: Propagate existing integrity/recovery failure; never substitute source runtime or legacy spawn.
  - User impact: Repair through existing managed recovery path.
- **External runtime override or legacy global runtime marker** (recoverable)
  - Detection: Canonical path differs from verified bound runtime.
  - Response: Explain retired external override and supported migration action before disruptive operations.
  - User impact: Explicit change required; no silent runtime selection.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| PATH contains no node/npm, Node20, Node26 or hostile fake executables | Owned runtime and absolute npm-cli execute; lifecycle children observe same22.22.1; global executables untouched. |
| Valid local distribution with network offline | Verify inventory and reuse without network. |
| Paths with spaces, relative overrides and homes behind symlinks | Quote argv, normalize legitimate state root once, require canonical in-root runtime; reject escaping/symlinked runtime directories. |
| Lockfile unchanged but runtime/native target changed | Old marker invalid; rebuild native dependencies under selected pin before activation. |
| Existing managed release/runtime and active workflows | Provision beside existing state; preserve release bytes, database and admission/drain/rollback semantics. |

**Invariants to preserve**

- Exact qualified runtime pin and signed managed fingerprint are authoritative; no runtime upgrade by latest resolution. [[c3]]
- No ambient npm or Node inheritance at installation-owned process boundaries. [[c1]]
- Preserve existing managed start/recovery ownership and IPC shapes; IPC stop fallback and native heap-corruption repairs remain outside this Story. [[c2]]

## 6. Test strategy

**Test framework:** `Use canonical Node22 test coordinator per docs/testing.md, serial bounded test files and recorded cleanup; existing TypeScript node:test and JetBrains Gradle/JUnit suites. ac1-ac4 are local proving labels derived from approved ISSUE prose, not fabricated upstream Story criteria. Build validation records exact commands, target coverage and unavailable platform evidence; do not report mocked tests as native qualification.`

**Test levels**

- **unit** — Verify deterministic policy, runtime identity and safe cache publication without downloading live assets.
  - Subjects: `Pin/target/digest table and generated shell/Kotlin asset parity`, `Version/architecture/path/inventory validation`, `Archive traversal, outside-link, partial-download and concurrent-stage rejection`, `Install-marker toolchain identity migration`
  - Fixtures: `Small trusted archive fixtures and corrupt variants`, `Recording downloader/process/extraction seams; no real user state`
- **integration** — Reproduce the observed Node26 build failure boundary with owned Node and npm, including bootstrap without installed Node.
  - Subjects: `Fresh shell install with node/npm absent`, `Legacy shell update/restart and TUI update with fake Node20/26/failing npm first on PATH`, `npm lifecycle child reports exact version and canonical executable`, `Failed native rebuild leaves previous selected runtime/daemon intact`, `Offline reuse and interrupted provisioning retry`
  - Fixtures: `Disposable HOME/installation checkout`, `Controlled local archive server with test policy digests`, `Process audit recorder for actual child argv/environment; no production daemon shutdown`
- **contract** — Extend existing suites and preserve client/release ownership.
  - Subjects: `src/daemon/__tests__/daemon-ctl-node-path.test.ts`, `src/cli/services/__tests__/daemon-ctl-install-marker.test.ts`, `src/cli/services/__tests__/maintenance-install-marker.test.ts`, `scripts/__tests__/stage-daemon-bundle.test.ts`, `scripts/__tests__/daemon-bundle-metadata.test.ts`, `vscode-plugin/src/daemon/__tests__/controller.test.ts`, `vscode-plugin/src/daemon/__tests__/commands.test.ts`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/NodeRuntimeResolverTest.kt`, `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/PrivateNodeProvisionerTest.kt`
  - Fixtures: `Existing managed release and rollback fixtures`, `Minimal GUI PATH and explicit external override fixtures`
- **smoke** — Prove actual official distribution/npm and native modules work after provisioning; mocks cannot establish portability.
  - Subjects: `Node22.22.1 and bundled npm version/path evidence on each advertised source target`, `Real npm install/build and representative native module load under owned Node`, `Installed daemon/helper/TUI/MCP wrapper executable identity`, `Managed signed release/rollback checks unchanged`
  - Fixtures: `Isolated macOS arm64 source installation initially`, `Target-specific CI runners for darwin-x64/linux-x64/linux-arm64; any unverified target stays disabled with explicit unsupported error`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Local proving label for ISSUE fixed toolchain: no/global20/global26/hostile PATH integration asserts actual child executable and npm lifecycle version.` |
| `ac2` | `Local proving label for verified bootstrap: no Node prerequisite, trusted archive, checksum mismatch, traversal, wrong target, corrupt cache, concurrency and offline reuse.` |
| `ac3` | `Local proving label for safe migration: lock+runtime marker reinstall, interrupted candidate, build failure, managed fingerprint/rollback regression and current client adapter parity.` |
| `ac4` | `Local proving label for platform support: real native smoke per enabled target; unsupported/missing-policy cases fail clearly.` |

## 7. Migration

**State before:** Legacy installer requires global Node>=20; shell/TUI build may execute bare npm; start may inherit process.execPath; JetBrains may reuse globalNode or provision20.18.0. Managed releases already carry signed tools/node and runtime identity.

**State after:** Source installs bind to a verified full22.22.1 distribution and matching npm; all installation-owned child boundaries use it. Managed runtime selection remains release-local and signed. External global overrides no longer authorize an installed daemon runtime.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Ship canonical pin/digests and matching bootstrap/client assets. Verify official archive provenance/digests during implementation and record evidence; enable only targets with native smoke evidence. — ↩ rollbackable
2. For existing installs, inspect runtime ownership and managed state read-only; do not overwrite installed revision or synchronize source implicitly. Provision candidate full distribution beside active installation; offline verified cache reuse allowed. — ↩ rollbackable
3. Stage source candidate dependencies/build with owned Node/npm and new lock+toolchain marker; preserve old checkout/selected runtime until native smoke and build pass. Existing macOS upgrade bridge and managed controller continue to own staging, admission, activation and recovery. — ↩ rollbackable
4. Publish source installation binding atomically and activate through existing lifecycle only after technical readiness. Preserve existing journal/descriptor and release trust schema; no database rewrite. Installer retry recognizes incomplete stage and does not trust partial markers. — ↩ rollbackable
5. Run bounded smoke and executable identity checks; on activation failure retain/restore previous binding via existing recovery. Keep previous toolchain until no selected source install or retained rollback references it; automatic cache garbage collection is not added. — ↩ rollbackable
6. Record build validation evidence and limitations, present final build artifact for separate human approval, then complete tracked work. No live production restart is required to author or approve this design. — ↩ rollbackable

**Backward compat:** IPC names/payloads, Node native ABI pin and signed managed release bytes remain compatible. Legacy bare lock-only markers are intentionally invalidated; next successful source migration reinstalls dependencies. Arbitrary INSRC_NODE_BIN, daemon-node external paths and JetBrains system-first policy are intentionally retired with clear migration diagnostics. Explicit developer source sessions remain supported; existing deprecated insrc-ide receives no release gate.

## 8. Alternatives considered

### 8.1 a1: Prefer a compatible system Node

Search installed Node22 versions and prepend their directory.

Retain ambient Node probing and select an available Node22 for daemon and npm. Require a global installation when none exists.

**Rejected because:** Fails approved ISSUE's fixed local runtime and no global dependency requirements.

### 8.2 a2: Verified installation-owned toolchain — **CHOSEN**

Provision pinned full Node/npm archives for source installs and consume existing signed runtimes for managed releases.

Use one release policy pin22.22.1 and per-platform trusted archive digests. Bootstrap without Node in shell, publish full distribution atomically in a private content-addressed runtime store, bind source installs to its verified Node/npm, and retain signed tools/node ownership for managed releases. Route installer, shell/TUI updates, helpers and current clients through this selection policy.

### 8.3 a3: Bundle-only distribution

Eliminate source install and update builds in favor of signed binaries.

Require every installation and client to consume only qualified signed daemon bundles, removing source checkout update/build support entirely.

**Rejected because:** Preserves managed integrity but removes source installation/update functionality and expands release policy scope.

## 9. References

- **[[c1]]** `code` `scripts/daemon-ctl.sh`
- **[[c2]]** `code` `src/cli/services/daemon.ts`
- **[[c3]]** `code` `scripts/daemon-bundle-metadata.mjs`
- **[[c4]]** `code` `src/cli/services/maintenance.ts`
- **[[c5]]** `prior-artifact` `docs/standalone/use-daemon-owned-node-runtime-predictable-E20261120175ab0d1/ISSUE.md`
- **[[c6]]** `code` `scripts/insrc-daemon-install.sh`
- **[[c7]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DefaultPrivateNodeProvisioner.kt`
- **[[c8]]** `code` `scripts/package-daemon-bootstrap.mjs`
