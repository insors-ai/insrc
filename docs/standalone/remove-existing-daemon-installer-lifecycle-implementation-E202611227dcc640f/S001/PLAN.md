<!-- insrc:artifact PLAN-7dcc640fef47d9e6-s1 -->

# Plan: STORY-7dcc640fef47d9e6-s1

## Summary

**Epic:** `remove-existing-daemon-installer-lifecycle-implementation`
**LLD run:** `wf-1795374098665-sasfw7`
**LLD effective hash:** `7dcc640fef47...`

Remove the committed daemon lifecycle deletion scope in coherent backend, CLI and IDE batches, then reconcile packaging and validate the retained application boundaries. Account for all 278 whole files and 176 member/test entries without touching installed user state or introducing a replacement engine. Run the final build and focused retained tests after all edits, then request one story build approval.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Freeze deletion accounting and retained validation scope | S | — | — | smoke: Preflight source-hash/selector, manifest accounting, existing script/test-selector and toolchain-availability checks (read-only; no live daemon operation). | [[c1]] [[c3]] [[c4]] [[c5]] [[c6]] |
| 2 | **`t2`** Delete all dedicated lifecycle sources and tests | M | — | `t1` | smoke: 278-path absence and preserved-noncandidate-file accounting check; no per-task full build. | [[c1]] [[c2]] [[c5]] [[c6]] |
| 3 | **`t3`** Remove backend lifecycle slices while preserving shared ownership | L | — | `t2` | unit: Retained shared process identity/run-file guard and generic IPC subsets, including src/shared/__tests__/daemon-process.test.ts, src/shared/__tests__/daemon-run-files.test.ts and src/shared/__tests__/ipc-client.test.ts (executed after all edits in t8). | [[c1]] [[c2]] [[c3]] [[c4]] [[c6]] |
| 4 | **`t4`** Remove CLI lifecycle commands and launcher authority | L | — | `t3` | integration: Retained CLI command/model/configuration and status/backup/compact assertions, plus CLI/MCP launch contract/source checks (bounded execution in t8). | [[c1]] [[c2]] [[c3]] [[c4]] [[c6]] |
| 5 | **`t5`** Remove VS Code lifecycle controls and installer onboarding | L | — | `t4` | integration: Retained vscode-plugin/src/__tests__/activation.test.ts, vscode-plugin/src/onboarding/__tests__/onboarding.test.ts and mixed model/settings/debug assertions (executed in t8). | [[c1]] [[c2]] [[c3]] [[c4]] [[c6]] |
| 6 | **`t6`** Remove JetBrains lifecycle controls and update contracts | L | — | `t5` | integration: Focused surviving JetBrains gateway/settings/model/onboarding JUnit classes through existing jetbrains-plugin/test-bridge/run-focused-junit.ts where available (executed in t8). | [[c1]] [[c2]] [[c3]] [[c4]] [[c6]] |
| 7 | **`t7`** Reconcile build packaging inventories and cleanup documentation | M | — | `t6` | smoke: Final 278-file/176-entry accounting, dangling executable reference/asset/command audit, and reviewed source-inventory check. | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] |
| 8 | **`t8`** Build and validate all retained boundaries once removal is complete | L | — | `t7` | smoke: npm run build and npm run typecheck:tools; VS Code npm run build/npm run bundle after removing retired generator inputs; available JetBrains compile/focused JUnit.; unit: Bounded retained shared guard/identity/IPC and model/config/workflow tests through the existing npm test coordinator; preserve mixed-suite resource teardown and client integration assertions. | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] |

### 1.1 TASK-7dcc640fef47d9e6-s1-t1 — Freeze deletion accounting and retained validation scope

Verify current candidate hashes/selectors against baseline728c31abc; capture278 file and176 member entries, retained shared boundaries, actual test selectors and available toolchains. Establish workspace-only command scope and per-entry completion accounting without deleting code yet.

**Acceptance checks:**
- Every candidate path and member selector is accounted for and matches source; no stale line-range deletion is used.
- Exact backend/VS Code scripts and focused retained tests are selected; JetBrains compile/JUnit availability is recorded.
- No installed daemon process, runtime, launch job or data outside the repository is touched.

### 1.2 TASK-7dcc640fef47d9e6-s1-t2 — Delete all dedicated lifecycle sources and tests

Delete exactly the278 whole-file candidates:143 implementation/build/asset/CI files,115 tests and20 helpers. Preserve the manifests/evidence and all noncandidate shared code. This batch owns physical whole-file removal; subsequent tasks remove surviving integration references before final validation. Full build and behavioral tests are deferred until the whole removal sequence is integrated in t8; this task validates physical removal and accounting only.

**Acceptance checks:**
- All278 candidate files are removed from tracked source and recorded once in deletion accounting.
- No noncandidate whole file is deleted; shared process identity, generic guards and protected model/config/workflow tests remain.
- No replacement installer, supervisor, launcher authority or release-signing system is added.

### 1.3 TASK-7dcc640fef47d9e6-s1-t3 — Remove backend lifecycle slices while preserving shared ownership

Remove backend/shared lifecycle member entries: managed/probation/control dispatch, update contracts/ack hooks, PID/supervisor wiring, lifecycle-only guard pin/transfer/borrow, worker-to-main stop operations and corresponding mixed-test slices. Keep genericIPC,keystore identity/guards,model bootstrap,workflow artifacts and application-owned resource-close callbacks in surviving modules.

**Acceptance checks:**
- Every backend/shared member entry is removed or narrowed with its required retained behavior preserved.
- Keystore guard acquisition/conflict/reclaim and process identity remain; no generic IPC lifetime/cancellation/uncertainty primitive is removed.
- Mixed model/config/status/resource-close tests retain non-lifecycle assertions; no broad engine is reintroduced.

### 1.4 TASK-7dcc640fef47d9e6-s1-t4 — Remove CLI lifecycle commands and launcher authority

Remove identified CLI start/stop/restart/update methods,types,command cases,pane actions,orphan kill controls,service bindings and shell-owned-runtime/source-selection slices. Keep CLI/MCP executable contracts, general status/backup/compact,model/tier decisions,host registration,log/MCP diagnostics and offline maintenance safety with direct surviving integration.

**Acceptance checks:**
- CLI lifecycle member entries and their dedicated mixed-test slices are accounted for; no control remains advertised without implementation.
- Generic CLI/MCP launch still resolves a valid development application entry without owned installer/supervisor fallback.
- Status/version/root lookup,backup/compact,model decisions and connection-maintenance stopped-store proofs survive with no hidden lifecycle execution.

### 1.5 TASK-7dcc640fef47d9e6-s1-t5 — Remove VS Code lifecycle controls and installer onboarding

Remove identified extension controller/commands,freshness,auto-start,restart offers,orphan action,manifest contributions and install step/test slices. Preserve generic activation/status,settings/model saves,repository registration,host MCP/steering wiring,debug clients/logs and retryable onboarding state.

**Acceptance checks:**
- All VS Code member entries and lifecycle-only contributions/imports are accounted for; no installer/control asset remains a packaging input.
- Onboarding still registers workspaces and wires hosts with existing consent/retry semantics; generic reachability remains.
- Mixed model/configuration tests retain checks/approvals/saves while old restart execution assumptions are removed.

### 1.6 TASK-7dcc640fef47d9e6-s1-t6 — Remove JetBrains lifecycle controls and update contracts

Remove identified gateway lifecycle methods/types/fields,settings daemon lifecycle panel/restart execution and corresponding mixed JUnit slices; dedicated lifecycle/freshness sources were deleted in t2. Preserve generic RPC,status,backup/compact,model/settings workflow and project/host onboarding contracts.

**Acceptance checks:**
- All JetBrains member entries are accounted for; no removed controller/resource/import remains wired in surviving code.
- Generic gateway and backup/compact/status DTOs survive; only update-specific fields and methods are removed.
- Mixed settings/model tests preserve save/decision/error semantics rather than deleting the whole test or flow.

### 1.7 TASK-7dcc640fef47d9e6-s1-t7 — Reconcile build packaging inventories and cleanup documentation

Remove remaining lifecycle-only build requirements,native-helper invocations,installer resource generators and release/control wiring from retained files. Review source classification/digest inventories for actual changed boundaries; keep integrity gates. Finish full manifest/member accounting and document temporary absence of lifecycle controls.

**Acceptance checks:**
- Current production/client/shell/package/build scans find no executable references to deleted lifecycle targets; historical records may remain.
- All278 file and176 member entries have an outcome; retained non-lifecycle behavior and unavoidable integration edits are identified.
- Build/test coordination and unrelated resource packaging remain intact; source inventories are reviewed, not blindly bypassed.

### 1.8 TASK-7dcc640fef47d9e6-s1-t8 — Build and validate all retained boundaries once removal is complete

Run one normal backend build and required typechecks,VS Code typecheck/bundle,available JetBrains compilation/focused JUnit,and bounded focused retained tests chosen in t1. Fix only removal-related integration regressions,record concrete limitations,and prepare one story build approval after all tasks are built/tested. No real user installer/start/stop/update or native qualification matrices.

**Acceptance checks:**
- Backend and VS Code compile/package checks pass; available JetBrains checks pass or exact toolchain limits are reported.
- Selected retained shared guard/identity,IPC,model/config,workflow,client onboarding and application resource-close tests pass; unrelated pre-existing failures are distinguished with evidence.
- Final accounting proves complete deletion scope and no installed-state mutation,no hidden replacement engine,and one pending story build approval only.
- An unavailable required check is explicitly unverified, never reported as a passing result; no repeated matrix or unrelated regression sweep is launched.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| All 278 whole-file candidates absent from tracked source; all 176 member/test entries accounted for as removed declaration or narrowed slice. | `t1`, `t2`, `t7`, `t8` |
| No executable imports, commands, packaging inputs, lifecycle CI or test selectors point at removed targets. | `t1`, `t2`, `t7`, `t8` |
| Retained files and tests preserve the explicit non-lifecycle responsibilities from both manifests. | `t1`, `t2`, `t7`, `t8` |
| Shared process identity and shared run-file/keystore guard behavior. | `t3`, `t4`, `t8` |
| Configuration/catalog/model validation and generic IPC framing, timeout, uncertainty and persistent lanes. | `t3`, `t4`, `t8` |
| Retained workflow artifact lifecycle and model approval/tier save assertions. | `t3`, `t4`, `t8` |
| VS Code activation/reachability, onboarding registration/host wiring, settings/model flows, backup/compact/status and debug MCP/log surfaces. | `t3`, `t4`, `t5`, `t6`, `t8` |
| JetBrains remaining gateway/settings/model/onboarding code and focused JUnit suites where toolchain is available. | `t3`, `t4`, `t5`, `t6`, `t8` |
| Application-owned worker/queue/store/socket draining assertions retained from mixed suites. | `t3`, `t4`, `t5`, `t6`, `t8` |
| One normal backend build plus required backend/tool typechecks. | `t1`, `t7`, `t8` |
| VS Code typecheck/bundle and resource checks. | `t1`, `t7`, `t8` |
| JetBrains compile/focused tests when available; explicitly record any unavailable check. | `t1`, `t7`, `t8` |
| No test invokes real installer/update/start/stop on the user's installation; no multi-platform native qualification matrix. | `t1`, `t7`, `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails and summary`
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges and retained shared ownership`
- **[[c3]]** `prior-artifact` `LLD s1 errorPaths and invariantsToPreserve`
- **[[c4]]** `prior-artifact` `LLD s1 testStrategy and acceptanceMapping`
- **[[c5]]** `prior-artifact` `LLD s1 migration and backwardCompat`
- **[[c6]]** `prior-artifact` `LLD s1 dataModelChanges exact 278-file/176-member manifests`
