<!-- insrc:artifact PLAN-175ab0d1d56838a9-s1 -->

# Plan: STORY-175ab0d1d56838a9-s1

## Summary

**Epic:** `use-daemon-owned-node-runtime-predictable`
**LLD run:** `wf-1795235086264-abn2jy`
**LLD effective hash:** `89a91b114ba5...`

Implement the approved local Node/npm runtime design in seven ordered tasks, starting with trusted policy and bootstrap, then routing installed process boundaries through the owned toolchain. Preserve signed managed releases and stage migration before activation. Complete isolated native qualification and record evidence before the final build approval. Revision 2 clarifies that t5 proves the shared installer mechanism with an isolated enabled fixture policy while public targets stay disabled. Task t7 retains actual npm install/build/native qualification and must additionally prove a fresh install using the promoted canonical packaged policy before final BUILD approval; task identities, dependencies and existing test names are unchanged.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define the pinned runtime policy and trusted distribution identities | M | approved r1 | — | unit: Policy/version/target/digest validation and generated asset/release-pin parity; unsupported target rejection | [[c1]] [[c2]] |
| 2 | **`t2`** Provision and verify the local toolchain without global Node | M | approved r1 | `t1` | unit: Archive digest/traversal/link/device/version rejection, cached inventory corruption, publication locking and owned cleanup; integration: Node-free bootstrap, offline verified reuse, concurrent/interrupted provisioning in disposable HOME | [[c1]] [[c3]] |
| 3 | **`t3`** Use the owned toolchain throughout shell installation and control | M | approved r1 | `t2` | integration: Shell installer/control/bridge actual child identity with absent/20/26/fake Node/npm, sanitized injection environment and quoted paths; unit: Extend src/daemon/__tests__/daemon-ctl-node-path.test.ts and src/cli/services/__tests__/daemon-ctl-install-marker.test.ts for owned selection and lock+toolchain marker failures | [[c1]] [[c4]] [[c5]] |
| 4 | **`t4`** Align TUI daemon maintenance and installed executable wrappers | M | approved r1 | `t2`, `t3` | integration: Installed TUI/MCP wrappers and daemon start record owned executable; TUI update uses absolute npm-cli and lifecycle child version; unit: Extend src/cli/services/__tests__/maintenance-install-marker.test.ts and managed start/error fixtures; preserve nativeBuildEnv flags | [[c1]] [[c4]] [[c5]] |
| 5 | **`t5`** Align current IDE clients and runtime packaging | M | approved r1 | `t1`, `t2`, `t3`, `t4` | unit: Extend VS Code controller/commands and JetBrains NodeRuntimeResolverTest/PrivateNodeProvisionerTest for shared local policy and no host runtime selection; integration: Packaged installer/bootstrap policy consistency and existing signed staging/fingerprint verification regression | [[c1]] [[c2]] [[c5]] [[c6]] |
| 6 | **`t6`** Complete staged migration and recovery behavior | M | approved r1 | `t3`, `t4`, `t5` | integration: Stage install/native/build failure before activation; binding/journal interruption retry and managed rollback retain previous selection; unit: Old marker migration, external override diagnostics, no database rewrite or deletion of referenced runtime | [[c1]] [[c3]] [[c5]] [[c7]] |
| 7 | **`t7`** Qualify runtime identity and native compatibility end to end | M | approved r1 | `t1`, `t2`, `t3`, `t4`, `t5`, `t6` | smoke: Actual official Node22.22.1/npm, npm lifecycle child paths, npm install/build and native module load per enabled target; integration: Canonical bounded regression and IDE build suites; signed managed recovery/rollback; no active owned test children after cleanup | [[c1]] [[c8]] |

### 1.1 TASK-175ab0d1d56838a9-s1-t1 — Define the pinned runtime policy and trusted distribution identities

Create canonical Node22.22.1 policy and generated/checked shell/client assets, with authenticated official archive provenance and fixed per-target digests. Align existing production/development/Linux release pin checks without changing signed release formats.

**Acceptance checks:**
- Policy includes schema, exact version, target, fixed HTTPS URL, digest and expected Node/npm layout; no latest lookup.
- Generated adapter assets and qualified release pins cannot drift.
- Record candidate digests but keep public target enablement disabled pending native proof in t7; fixture/qualification policy is isolated and cannot bypass production verification. Unsupported targets fail clearly.
- Document exact provenance and digest acquisition evidence.

### 1.2 TASK-175ab0d1d56838a9-s1-t2 — Provision and verify the local toolchain without global Node

Implement shell bootstrap and private content-addressed distribution store with bounded download, trusted digest verification, safe extraction, private staging, publication locking, atomic rename, verified cache reuse and installation binding primitives.

**Acceptance checks:**
- Bootstrap succeeds in disposable HOME with no node/npm; verified distribution contains matching Node/npm and licenses.
- Reject corrupt archives/cache, wrong target/version, traversal, outside links and partial artifacts before execution.
- Offline valid cache reuse performs no download; interrupted/concurrent provisioning never publishes partial state.
- Each source binding references exactly one verified canonical store object; no global runtime mutation or unsafe cleanup.

### 1.3 TASK-175ab0d1d56838a9-s1-t3 — Use the owned toolchain throughout shell installation and control

Wire installer, upgrade bridge and daemon control Node/npm invocations to verified ownership. Use absolute Node/npm-cli, controlled lifecycle PATH, sanitized Node injection variables and lock+toolchain native install marker; preflight before disruptive actions.

**Acceptance checks:**
- Fresh installer and legacy update/restart ignore ambient Node20/26 and fake npm; child process identity proves22.22.1.
- All shell installer/bridge/helper Node calls use selected absolute runtime; npm runs under its matching Node.
- External INSRC_NODE_BIN/legacy global marker fail with migration guidance; a matching canonical owned path is accepted.
- Old lock-only marker or changed runtime/target forces native dependency install; failure leaves no success marker.
- Managed commands delegate existing controller with signed tools/node and do not mutate release bytes.

### 1.4 TASK-175ab0d1d56838a9-s1-t4 — Align TUI daemon maintenance and installed executable wrappers

Change installed startDaemon and TUI update boundaries to select verified installation-owned runtime/npm; preserve existing result/IPC contracts and nativeBuildEnv behavior. Make installed TUI/MCP wrappers use owned Node while retaining explicit developer entry points.

**Acceptance checks:**
- Installed daemon start no longer inherits caller process.execPath; managed starts remain controller-owned.
- TUI maintenance uses absolute matching npm-cli, lifecycle environment and same toolchain-aware install marker as shell.
- Installed TUI/MCP wrapper smoke records owned runtime identity under minimal/hostile PATH.
- Missing/corrupt runtime returns actionable failure and never silently selects system Node; developer sessions are not unexpectedly re-executed.

### 1.5 TASK-175ab0d1d56838a9-s1-t5 — Align current IDE clients and runtime packaging

Update current VS Code and JetBrains adapters to shared bootstrap/ownership policy. Retire JetBrains system-first and20.18.0 provisioning. Package matching bootstrap assets and preserve authenticated bundle tools/node, fingerprint and rollback contracts.

**Acceptance checks:**
- IDE host/system Node is never chosen as daemon runtime; adapters invoke shared verified provisioner/selection contract.
- No independent stale JetBrains pin/digest/download policy remains; injectable tests cover provisioning and failures.
- Packaged installer/bootstrap/client policy assets agree. At t5, prove the no-global-Node fresh-install mechanism using the actual official distribution under an explicitly isolated enabled fixture policy; keep the public policy disabled pending t7 qualification. Public target enablement and actual packaged-policy installation are t7 requirements, not t5 admission prerequisites.
- Existing signed bundles remain byte-immutable and retain existing verification/managed lifecycle; newly packaged bootstrap includes any expanded toolchain under new authentication.
- Current IPC names/payloads remain unchanged; no deprecated insrc-ide release requirements.

### 1.6 TASK-175ab0d1d56838a9-s1-t6 — Complete staged migration and recovery behavior

Integrate verified toolchain bindings with existing legacy upgrade staging and managed admission/activation/recovery. Keep previous candidate, binding and rollback runtime until readiness; record failure outcomes and migration instructions.

**Acceptance checks:**
- Existing selected installation remains intact through provisioning, npm install, build or native smoke failure.
- Commit source binding/activation only after staged technical checks; recover interruption without trusting incomplete markers.
- Managed journal, descriptor, release floor, trust domain and rollback verification are preserved.
- No database rewrite, automatic runtime garbage collection or implicit source overwrite; old referenced toolchains retained.
- Document retired external overrides, repair/offline flow and explicit runtime upgrade policy; keep LLD component ownership accurate.

### 1.7 TASK-175ab0d1d56838a9-s1-t7 — Qualify runtime identity and native compatibility end to end

Run bounded regression suites and isolated actual distribution/native smoke on enabled targets. Record commands, executable identities, evidence, cleanup and unavailable target coverage; validate the final build artifact before separate human completion approval.

**Acceptance checks:**
- Record exact owned Node/npm and lifecycle child paths under no/global20/global26/hostile PATH; prove bootstrap, offline reuse and retry.
- Run real npm install/build and representative native module load, not only mocked version tests.
- Run source migration failure and signed managed recovery/rollback regressions plus current IDE client contract tests.
- Promote public source-target enablement only after actual target/native smoke evidence; unverified targets remain disabled and are reported. No implicit dependency from t1 back to qualification.
- Canonical test coordinator releases all owned children and records cleanup; final BUILD validation contains evidence/limitations before human approval, without demanding approval as a technical test.
- After actual install/build/native qualification permits target promotion, regenerate canonical client/bootstrap assets and prove fresh install with the actual enabled packaged policy, no fixture-policy substitution, before final BUILD approval.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Pin/target/digest table and generated shell/Kotlin asset parity | `t1`, `t5` |
| Version/architecture/path/inventory validation | `t2` |
| Archive traversal, outside-link, partial-download and concurrent-stage rejection | `t2` |
| Install-marker toolchain identity migration | `t3`, `t4` |
| Fresh shell install with node/npm absent | `t2`, `t3` |
| Legacy shell update/restart and TUI update with fake Node20/26/failing npm first on PATH | `t3`, `t4` |
| npm lifecycle child reports exact version and canonical executable | `t3`, `t4`, `t7` |
| Failed native rebuild leaves previous selected runtime/daemon intact | `t6` |
| Offline reuse and interrupted provisioning retry | `t2`, `t6` |
| src/daemon/__tests__/daemon-ctl-node-path.test.ts | `t3` |
| src/cli/services/__tests__/daemon-ctl-install-marker.test.ts | `t3` |
| src/cli/services/__tests__/maintenance-install-marker.test.ts | `t4` |
| scripts/__tests__/stage-daemon-bundle.test.ts | `t5`, `t7` |
| scripts/__tests__/daemon-bundle-metadata.test.ts | `t5`, `t7` |
| vscode-plugin/src/daemon/__tests__/controller.test.ts | `t5` |
| vscode-plugin/src/daemon/__tests__/commands.test.ts | `t5` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/NodeRuntimeResolverTest.kt | `t5` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/PrivateNodeProvisionerTest.kt | `t5` |
| Node22.22.1 and bundled npm version/path evidence on each advertised source target | `t7` |
| Real npm install/build and representative native module load under owned Node | `t7` |
| Installed daemon/helper/TUI/MCP wrapper executable identity | `t4`, `t7` |
| Managed signed release/rollback checks unchanged | `t5`, `t6`, `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/standalone/use-daemon-owned-node-runtime-predictable-E20261120175ab0d1/S001/LLD.md#summary`
- **[[c2]]** `prior-artifact` `docs/standalone/use-daemon-owned-node-runtime-predictable-E20261120175ab0d1/S001/LLD.md#3-data-model-changes`
- **[[c3]]** `prior-artifact` `docs/standalone/use-daemon-owned-node-runtime-predictable-E20261120175ab0d1/S001/LLD.md#3-data-model-changes`
- **[[c4]]** `prior-artifact` `docs/standalone/use-daemon-owned-node-runtime-predictable-E20261120175ab0d1/S001/LLD.md#2-contract-details`
- **[[c5]]** `prior-artifact` `docs/standalone/use-daemon-owned-node-runtime-predictable-E20261120175ab0d1/S001/LLD.md#3-data-model-changes`
- **[[c6]]** `prior-artifact` `docs/standalone/use-daemon-owned-node-runtime-predictable-E20261120175ab0d1/S001/LLD.md#3-data-model-changes`
- **[[c7]]** `prior-artifact` `docs/standalone/use-daemon-owned-node-runtime-predictable-E20261120175ab0d1/S001/LLD.md#7-migration`
- **[[c8]]** `prior-artifact` `docs/standalone/use-daemon-owned-node-runtime-predictable-E20261120175ab0d1/S001/LLD.md#6-test-strategy`
