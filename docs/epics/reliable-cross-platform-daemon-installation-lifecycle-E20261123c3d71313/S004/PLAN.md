<!-- insrc:artifact PLAN-c3d71313f34bce71-s4 -->

# Plan: STORY-c3d71313f34bce71-s4

## Summary

**Epic:** `reliable-cross-platform-daemon-installation-lifecycle`
**LLD run:** `wf-1795668362232-muovqd`
**LLD effective hash:** `ca69fcdcd2b0...`

Build S4 through the same twelve bounded tasks covering admission, exclusive daemon ownership, detached exit observation, IPC shutdown and manager lifecycle composition. Helper tasks run only their concrete surrounding tests; actual native qualification subjects belong to final T12, followed by the fixed scoped regression and one final human BUILD gate. T1 retains its native lease until actual process exit, because the existing close(void) cannot prove release. S1/S2 production prerequisites, S5 hook flows and unavailable native routes remain explicit gates; no fixture result substitutes for real qualification.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Validate lifecycle evidence and exclusive daemon ownership | M | approved r1 | — | unit: wrong-instance/stale/duplicate requests; unit: forged completion rejected; unit: receipt-decoder-rejects-extra-identity-mismatch-wrong-purpose-path-escape-and-replacement; integration: startup guard and exclusive data lease; integration: exclusive-data-lease-held-until-all-store-workers-close-or-actual-exit; integration: Surrounding regression selector: src/installer/__tests__/controller-store.test.ts; unit: canonical Unix and Windows lifecycle endpoint and receipt identity validation | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Bind child launch to the live manager admission | M | approved r1 | `t1` | integration: Candidate live after manager death denies competing store ownership; only admitted activating boot proceeds.; integration: delayed-child-revalidates-live-admission-before-spawn-lease-and-store-open; integration: owner-loss-before-final-grant-denies-start-owner-loss-after-grant-retains-single-owner; integration: Surrounding regression selector: src/installer/__tests__/manager.test.ts; integration: Surrounding regression selector: src/installer/__tests__/operation-control.test.ts | [[c2]] [[c3]] |
| 3 | **`t3`** Guard the daemon before importing application stores | M | approved r1 | `t1`, `t2` | unit: missing-runtime-store-resolver-fails-before-launch; integration: startup guard and exclusive data lease; integration: Candidate live after manager death denies competing store ownership; only admitted activating boot proceeds.; integration: thin-entry-guard-runs-before-path-capture-db-imports-and-live-store-declaration; integration: exclusive-data-lease-held-until-all-store-workers-close-or-actual-exit; integration: delayed-child-revalidates-live-admission-before-spawn-lease-and-store-open; integration: owner-loss-before-final-grant-denies-start-owner-loss-after-grant-retains-single-owner; integration: receipt-selected-private-runtime-and-bound-ready-evidence-no-path-tools-node-or-sync-build; integration: Surrounding regression selector: src/daemon/__tests__/lifecycle-wiring.test.ts; integration: Surrounding regression selector: src/daemon/__tests__/lifecycle-adopt-wiring.test.ts | [[c1]] [[c3]] |
| 4 | **`t4`** Launch detached wrappers and observe exact child exit | M | approved r1 | `t1`, `t2` | unit: ack cannot authorize restart; integration: wrapper receipt after child self-exit; integration: Candidate live after manager death denies competing store ownership; only admitted activating boot proceeds.; integration: Wrapper survives manager self-exit; natural/failed migration child exit persists exact receipt without shutdown IPC.; integration: owner-loss-before-final-grant-denies-start-owner-loss-after-grant-retains-single-owner; integration: normal-lifetime-optional-receipt-and-missing-evidence-recovery-remain-truthful | [[c2]] [[c3]] [[c4]] |
| 5 | **`t5`** Persist protected immutable child exit receipts | M | approved r1 | `t1`, `t4` | unit: forged completion rejected; unit: receipt-decoder-rejects-extra-identity-mismatch-wrong-purpose-path-escape-and-replacement; integration: wrapper receipt after child self-exit; integration: Wrapper survives manager self-exit; natural/failed migration child exit persists exact receipt without shutdown IPC.; integration: Receipt fsync/publication crash points, wrong session/nonce/digest, wrapper death and missing receipt cannot authorize replacement.; integration: normal-lifetime-optional-receipt-and-missing-evidence-recovery-remain-truthful | [[c2]] [[c4]] [[c6]] |
| 6 | **`t6`** Keep authenticated lifecycle IPC on the main thread | M | approved r1 | `t1` | unit: wrong-instance/stale/duplicate requests; unit: legacy-daemon-status-payload-preserved-and-lifecycle-control-registry-parity; unit: control-auth-validates-installation-instance-operation-and-endpoint; integration: control remains available while draining; integration: lifecycle-control-bypasses-stalled-worker-maintenance-and-drain-queues; integration: per-request-write-callback-success-authorizes-exit-not-global-flush; integration: failed-or-backpressured-ack-never-triggers-new-immediate-action; integration: Surrounding regression selector: src/daemon/__tests__/server-forward.test.ts; integration: Surrounding regression selector: src/daemon/__tests__/server-registry.test.ts; integration: Surrounding regression selector: src/daemon/__tests__/server-utf8.test.ts; integration: Surrounding regression selector: src/daemon/threads/__tests__/method-class.test.ts | [[c1]] [[c5]] |
| 7 | **`t7`** Drain gracefully and preserve same-operation shutdown control | M | approved r1 | `t3`, `t4`, `t6` | unit: wrong-instance/stale/duplicate requests; integration: pending work graceful drain and immediate supersession; integration: control remains available while draining; integration: Real separate manager/IDE client escalates while original operation lock is held; duplicate/stale/owner-loss cases and unchanged nonce.; integration: exclusive-data-lease-held-until-all-store-workers-close-or-actual-exit; integration: lifecycle-control-bypasses-stalled-worker-maintenance-and-drain-queues; integration: Surrounding regression selector: src/daemon/__tests__/shutdown-store-failure.test.ts; integration: Surrounding regression selector: src/daemon/__tests__/store-failure-dispatch.test.ts; integration: Surrounding regression selector: src/installer/__tests__/operation-control.test.ts | [[c1]] [[c2]] [[c5]] [[c6]] |
| 8 | **`t8`** Implement qualified immediate calling-process exit | S | approved r1 | `t6`, `t7` | integration: pending work graceful drain and immediate supersession; integration: per-request-write-callback-success-authorizes-exit-not-global-flush; integration: failed-or-backpressured-ack-never-triggers-new-immediate-action | [[c1]] [[c5]] [[c6]] |
| 9 | **`t9`** Implement lifecycle observation and shutdown peer methods | M | approved r1 | `t4`, `t7`, `t8`, `t5` | unit: ack cannot authorize restart; unit: forged completion rejected; unit: observe-connection-refusal-and-free-lease-remain-uncertain; integration: Real separate manager/IDE client escalates while original operation lock is held; duplicate/stale/owner-loss cases and unchanged nonce.; integration: Receipt fsync/publication crash points, wrong session/nonce/digest, wrapper death and missing receipt cannot authorize replacement.; integration: normal-lifetime-optional-receipt-and-missing-evidence-recovery-remain-truthful; integration: Surrounding regression selector: src/installer/__tests__/manager.test.ts | [[c1]] [[c2]] [[c5]] [[c6]] |
| 10 | **`t10`** Implement admitted activation and migration lifetime peers | M | approved r1 | `t2`, `t3`, `t4`, `t9`, `t5` | unit: missing-runtime-store-resolver-fails-before-launch; integration: Candidate live after manager death denies competing store ownership; only admitted activating boot proceeds.; integration: Receipt fsync/publication crash points, wrong session/nonce/digest, wrapper death and missing receipt cannot authorize replacement.; integration: receipt-selected-private-runtime-and-bound-ready-evidence-no-path-tools-node-or-sync-build; integration: Surrounding regression selector: src/installer/__tests__/dev-manager.test.ts | [[c1]] [[c2]] [[c3]] [[c4]] |
| 11 | **`t11`** Compose real lifecycle peer behind owner prerequisite gates | M | approved r1 | `t9`, `t10` | unit: production-peers-exposes-nine-real-lifecycle-methods-and-no-placeholder-migrations; unit: missing-runtime-store-resolver-fails-before-launch; integration: receipt-selected-private-runtime-and-bound-ready-evidence-no-path-tools-node-or-sync-build; integration: S3-install-retry-still-install-only-update-cannot-clean-admission-and-Ollama-is-never-stopped; integration: Surrounding regression selector: src/installer/__tests__/production-peers.test.ts; integration: Surrounding regression selector: src/installer/__tests__/install-retry.test.ts | [[c1]] [[c6]] [[c7]] |
| 12 | **`t12`** Run S4 regression and available native lifecycle qualification | M | approved r1 | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t7`, `t8`, `t9`, `t10`, `t11` | integration: S3-install-retry-still-install-only-update-cannot-clean-admission-and-Ollama-is-never-stopped; live: Mac/Linux/Windows graceful and immediate exit; live: restart exact release ready; live: no PID/kill command execution; live: native DB reopen after immediate self-exit; live: qualified-_Exit-with-native-cleanup-hang-and-atexit-fixture-plus-real-LMDB-Lance-reopen; live: Unix-owner-protection-endpoint-length-stale-socket-safety-and-directory-durability; live: Windows-named-pipe-same-user-capability-protection-real-CRT-DLL-exit-and-lock-release; live: manager-terminal-loss-retains-wrapper-child-receipt-with-no-inherited-owner-lock; live: both-delivery-modes-use-verified-separate-runtime-store-and-no-host-fallback; live: leave-installed-host-v2-daemon-and-host-Ollama-untouched-use-only-isolated-test-homes; smoke: One final fixed-manifest installer/changed-daemon regression with matching fingerprints, bounded coordinator ownership and cleanup; preserve S2 long-file budgets. | [[c1]] [[c4]] [[c5]] [[c6]] [[c7]] [[c8]] |

### 1.1 TASK-c3d71313f34bce71-s4-t1 — Validate lifecycle evidence and exclusive daemon ownership

Implement S4-private strict validators for existing sc4 identities, shutdown/completion, LaunchAdmission and migration receipt plus a daemon data-lease wrapper over the existing qualified native lock. Preserve shared wire types and existing native control semantics.

**Acceptance checks:**
- Exact installation/release/instance/session/nonce/inventory/purpose/path binding rejects malformed or mismatched evidence before use; no PID/age/endpoint-disappearance inference.
- Separate processes cannot own one installation data lease concurrently; wrapper and manager never inherit/retain the daemon data lease or open application stores.
- Lease remains held until store/DB-worker close is proven or actual process exit; unknown native close remains uncertain. This wrapper retains its strong native handle until actual process exit and closes application resources through closeResources without treating legacy close(void) as native release evidence.

### 1.2 TASK-c3d71313f34bce71-s4-t2 — Bind child launch to the live manager admission

Add the S4-private protected bounded rendezvous used by LifecyclePort launch methods to call the existing in-process assertLiveOwner and compare the exact immutable admission. Keep sc2 controller and operation locking ownership unchanged.

**Acceptance checks:**
- Before spawn and pre-lease grant, require current live owner/operation/phase/revision/admission match; durable admission alone cannot authorize launch.
- After lease acquisition, final current-owner grant precedes application/store imports; loss before grant denies startup and releases lease. Loss after grant permits only already-admitted lifetime work.
- Capability/endpoint protection, cancellation, stale/replaced sessions and delayed child are cross-process tested; callback is never serialized and manager lock never inherited.

### 1.3 TASK-c3d71313f34bce71-s4-t3 — Guard the daemon before importing application stores

Keep src/daemon/index.ts as the out/daemon/index.js thin entry; move application startup into proposed src/daemon/application.ts with dependency-minimal managed-boot validation followed by dynamic import. Apply exact INSRC_HOME, selected runtime/admission and exclusive data lease before store side effects.

**Acceptance checks:**
- Instrumented fresh-process import ordering proves home validation before src/shared/paths.ts capture, DB/native-store imports and live-store declaration.
- Guard rejects wrong home/runtime/receipt, missing verified foundation runtime resolution, stale admission or conflicting/unknown lease; no tools/node/PATH/source fallback.
- Preserve existing application storage-health/ownership handling and deliberate explicit development/test entry behavior; no managed-production bypass or host daemon change.

### 1.4 TASK-c3d71313f34bce71-s4-t4 — Launch detached wrappers and observe exact child exit

Implement S4's detached single-child lifetime wrapper with log-bound streams, private child IPC, admission-bound readiness and exact actual-exit observation. Durable receipt publication is the next task; keep stores, controller and hook journal outside wrapper ownership.

**Acceptance checks:**
- Wrapper survives manager/terminal loss and tracks exactly one child per admitted session, never inherits/holds manager or daemon data locks, and never opens application stores/controller/journal.
- Readiness handshake binds exact candidate/admission/child identity. Wrapper produces request-bound live ShutdownCompletion only after actual exit; acknowledgement or endpoint disappearance cannot authorize replacement.
- Wrapper has no kill, watchdog, respawn or replacement policy. Child/stdio/channel faults produce bounded actionable uncertainty and owned actors close cleanly.
- Cross-process fixtures prove manager self-exit leaves admitted child and wrapper alive, delayed unadmitted children are denied, and child actual exit is distinguished from live-channel loss.

### 1.5 TASK-c3d71313f34bce71-s4-t5 — Persist protected immutable child exit receipts

Implement S4-private receipt publication/read/reconciliation for wrapper-observed actual exit. Migration sessions always publish the predeclared durable receipt; normal shutdown may retain optional operation-bound evidence. Wrapper remains sole receipt writer.

**Acceptance checks:**
- After exact migration child actual exit, publish only to <home>/install/receipts/<operationId>/<sessionId>.json using path-safe validated IDs, immutable exclusive publication, same-user protection and file/containing-directory durability where qualified.
- Every migration exit, including natural completion/hook failure/self-exit without shutdown request, persists the complete unchanged MigrationExitReceipt and identity/nonce/digest before notification; receipt survives manager loss.
- Read/recovery rejects missing, malformed, replaced, forged, wrong-purpose/session/nonce/digest/path evidence. Code0, free lease or completed hook journal is never migration success; S5 owns hook tests and journal decisions.
- General shutdown receipt remains optional and bound to its known request. If no matching retained evidence exists after manager loss, recovery remains uncertain rather than inventing future request proof.
- Crash-point, durability/protection failure and wrapper-loss fixtures prove missing/invalid receipt cannot authorize another child; receipt retention lasts through operation/recovery need, with no speculative cleanup.

### 1.6 TASK-c3d71313f34bce71-s4-t6 — Keep authenticated lifecycle IPC on the main thread

Add proposed private daemon.lifecycleStatus and daemon.shutdown routing before normal workers, maintenance and work queues. Expose per-JSON-RPC-reply socket.write completion so accepted shutdown actions can await their exact reply flush.

**Acceptance checks:**
- Legacy daemon.status response and ordinary method routing remain compatible; method registry/classification/schema/parity tests include new lifecycle controls.
- Protected Unix/named-pipe capability checks validate installation/current instance/operation and completion endpoint; arbitrary callback destinations or live endpoint unlink are rejected.
- Stalled workers, maintenance or graceful drain do not block asynchronous lifecycle control. Exact write callback success, not global flush/microtask/timer, authorizes exit; failed/backpressured/closed reply stays uncertain.

### 1.7 TASK-c3d71313f34bce71-s4-t7 — Drain gracefully and preserve same-operation shutdown control

Implement one daemon lifecycle state machine and application cleanup coordination: reject ordinary new work, drain already admitted work, close all owned resources, retain control through drain, and use existing operation-control forwarding for explicit same-operation escalation.

**Acceptance checks:**
- Graceful is default; accepted reply is ack only. Wrapper actual-exit completion plus ownership reconciliation precedes replacement; graceful timeout never chooses immediate.
- Control listener stays available through queue/native/worker cleanup; late admitted work and store failure follow existing safety ordering. Close control only at final exit boundary.
- Separate current/forwarding manager processes preserve held operation lock and original operation/instance/nonce during explicit immediate override; duplicates coalesce, stale/dead owner remains uncertain.
- Until t7 qualified immediate exists, explicit immediate returns unsupported before acceptance; no external daemon PID/signal/kill command in any error path.

### 1.8 TASK-c3d71313f34bce71-s4-t8 — Implement qualified immediate calling-process exit

Add S4's minimal _Exit(0) Node-API primitive in src/installer/native/control.c and src/installer/native.ts. Invoke only after explicit authenticated immediate admission and that request's successful reply flush; do not await graceful promises.

**Acceptance checks:**
- Missing/unqualified primitive returns unsupported before accepting immediate; unavailable control or flush cannot report stopped.
- Fixture proves bypass of pending graceful work/CRT atexit paths with actual exit observed by wrapper; no PID/handle/signal/external command, no timeout escalation or ExitProcess fallback.
- OS/DLL/native-store effects and exit latency remain independently target-qualified; non-exit remains uncertain rather than a bounded-success assertion.

### 1.9 TASK-c3d71313f34bce71-s4-t9 — Implement lifecycle observation and shutdown peer methods

Implement LifecyclePort.observe/shutdown/waitShutdownCompletion/reconcileShutdown in proposed src/installer/lifecycle-peer.ts using canonical location, protected control and exact wrapper evidence; consume existing manager serialization and forwarding.

**Acceptance checks:**
- observe reuses only exact matching ready identity; never-started or exact observed exit plus ownership allows absent, while refusal/socket disappearance/free lease alone is uncertain.
- shutdown validates exact acknowledgement; wait/reconcile require original operation/instance/completionNonce and positive resourceOwnershipReleased proof, rejecting stale/forged/lost evidence.
- Wrong identity, IPC failure, unreachable owner and deadline leave diagnostics and no competing replacement; existing immediate forwarding works without acquiring/stealing a second mutation lock.

### 1.10 TASK-c3d71313f34bce71-s4-t10 — Implement admitted activation and migration lifetime peers

Complete LifecyclePort.activate/reconcileActivation/launchMigration/readMigrationExitReceipt/migrationOwnership, launching exact selected verified runtime/candidate through the wrapper and returning exact ReadyEvidence. Consume S5 runner and installed verification capability without supplying hook policy or a placeholder peer.

**Acceptance checks:**
- All nine existing LifecyclePort methods are implemented; activate/reconcile validate admitted session/nonce/inventory/installation/release/instance/endpoint before success, with no sync/npm/build on start.
- launchMigration uses the same live admission and data lease; absent S5 runner fails explicitly, and fixture runners cannot qualify production migration behavior.
- Migration receipt lookup validates exact protected predeclared path and all identities/code/signal; ownership is released/held/unknown from qualified lease evidence, not PID. Hook tests/journal remain S5 and code0 is not success.
- Normal/migration child surviving manager loss cannot write controller or self-activate; a replacement manager reconciles exact lifetime before another child.

### 1.11 TASK-c3d71313f34bce71-s4-t11 — Compose real lifecycle peer behind owner prerequisite gates

Publish real S4 lifecycle methods from src/installer/production-peers.ts while leaving S5 migrations unavailable. Exercise production manager integration only with linked passing S1/S2 runtime-store correction and S1 action-scoped capability admission evidence; these are external prerequisite corrections, not S4 implementation tasks.

**Acceptance checks:**
- productionPeers exposes real delivery/dependency/lifecycle ports and deliberately no fake migrations; all nine lifecycle methods are asserted at the factory boundary.
- For each production acceptance claim, link the tracked S1/S2 verified runtime-store correction and S1 action-specific manager admission correction with approved revisions/commits and passing real owner-contract tests. If absent, assert/report the exact production path gated; no duplicate installer, tools/node/PATH fallback, no-op migrations or alternate manager. These corrections are external dependency work, not S4 tasks.
- Validate S4 composition and contracts with explicit fixture providers while distinguishing that evidence from production. Use actual corrected selected runtime/receipt/manager flow for any claimed enabled path; full install/upgrade/start migration/hook verification remains for S5/S8. Do not require S5 completion before S4 or claim fixture runners qualify production.
- S3 explicit Retry remains install-only, update cleanup cannot discard admission, and daemon lifecycle never stops/restarts independently installed Ollama.

### 1.12 TASK-c3d71313f34bce71-s4-t12 — Run S4 regression and available native lifecycle qualification

After all S4 implementation tasks, run one fixed-manifest installer/lifecycle scoped regression and bounded available isolated sc4 native smoke cases. Record owner prerequisite status and target-specific qualification honestly; S8 retains full release/IDE matrix and S5 retains real hook/journal end-to-end work. Maintain relevant sequence source and present the final human BUILD gate only after S4 task accounting/validation is complete. Actual native qualification subjects are assigned only to this final task; earlier helper fixture success cannot stand in for native results.

**Acceptance checks:**
- After implementation settles, final selected-file manifest covers installer plus changed daemon lifecycle/transport/ownership regressions, fingerprints match, and all owned actors close/dispose. Run only surrounding tests earlier; preserve intentional S2 budgets and S3 209/44 baseline as reference rather than frozen count.
- On each available enabled test route, collect actual isolated Linux OrbStack/macOS UTM/Windows runner evidence for graceful drain, explicit immediate, wrapper-observed exit before selected-ready restart, lease release and real LMDB/Lance reopen. Atexit fixture evidence alone cannot qualify native stores or Windows DLL behavior.
- Record every attempted target's OS/architecture/runtime/evidence/cleanup and passed, failed or unavailable status. Unavailable routes remain pending and disabled, with full matrix follow-up in S8; do not loop indefinitely or fake evidence. S3 dependency qualification does not qualify S4 lifecycle.
- Report S4 contract validation separately from S1/S2 prerequisite production acceptance and S5 hook/journal/full manager flows. Missing prerequisites gate those production claims; do not manufacture success or create a dependency requiring S5 before S4.
- No installed host v2 daemon/Ollama mutation, no daemon PID/signal/kill commands. Update structured sequence sources only if implementation changed described boundaries; inspect generated source and report actual visual verification limits.
- After all S4 tasks and required enabled-target validations pass, present one final BUILD for human approval; do not invoke unavailable automated review or ask per-task human build approval.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| wrong-instance/stale/duplicate requests | `t1`, `t6`, `t7` |
| ack cannot authorize restart | `t4`, `t9` |
| forged completion rejected | `t1`, `t5`, `t9` |
| production-peers-exposes-nine-real-lifecycle-methods-and-no-placeholder-migrations | `t11` |
| legacy-daemon-status-payload-preserved-and-lifecycle-control-registry-parity | `t6` |
| control-auth-validates-installation-instance-operation-and-endpoint | `t6` |
| observe-connection-refusal-and-free-lease-remain-uncertain | `t9` |
| missing-runtime-store-resolver-fails-before-launch | `t3`, `t10`, `t11` |
| receipt-decoder-rejects-extra-identity-mismatch-wrong-purpose-path-escape-and-replacement | `t1`, `t5` |
| pending work graceful drain and immediate supersession | `t7`, `t8` |
| wrapper receipt after child self-exit | `t4`, `t5` |
| control remains available while draining | `t6`, `t7` |
| startup guard and exclusive data lease | `t1`, `t3` |
| Real separate manager/IDE client escalates while original operation lock is held; duplicate/stale/owner-loss cases and unchanged nonce. | `t7`, `t9` |
| Candidate live after manager death denies competing store ownership; only admitted activating boot proceeds. | `t2`, `t3`, `t4`, `t10` |
| Wrapper survives manager self-exit; natural/failed migration child exit persists exact receipt without shutdown IPC. | `t4`, `t5` |
| Receipt fsync/publication crash points, wrong session/nonce/digest, wrapper death and missing receipt cannot authorize replacement. | `t5`, `t9`, `t10` |
| thin-entry-guard-runs-before-path-capture-db-imports-and-live-store-declaration | `t3` |
| exclusive-data-lease-held-until-all-store-workers-close-or-actual-exit | `t1`, `t3`, `t7` |
| delayed-child-revalidates-live-admission-before-spawn-lease-and-store-open | `t2`, `t3` |
| owner-loss-before-final-grant-denies-start-owner-loss-after-grant-retains-single-owner | `t2`, `t3`, `t4` |
| lifecycle-control-bypasses-stalled-worker-maintenance-and-drain-queues | `t6`, `t7` |
| per-request-write-callback-success-authorizes-exit-not-global-flush | `t6`, `t8` |
| failed-or-backpressured-ack-never-triggers-new-immediate-action | `t6`, `t8` |
| receipt-selected-private-runtime-and-bound-ready-evidence-no-path-tools-node-or-sync-build | `t3`, `t10`, `t11` |
| normal-lifetime-optional-receipt-and-missing-evidence-recovery-remain-truthful | `t4`, `t5`, `t9` |
| S3-install-retry-still-install-only-update-cannot-clean-admission-and-Ollama-is-never-stopped | `t11`, `t12` |
| Mac/Linux/Windows graceful and immediate exit | `t12` |
| restart exact release ready | `t12` |
| no PID/kill command execution | `t12` |
| native DB reopen after immediate self-exit | `t12` |
| qualified-_Exit-with-native-cleanup-hang-and-atexit-fixture-plus-real-LMDB-Lance-reopen | `t12` |
| Unix-owner-protection-endpoint-length-stale-socket-safety-and-directory-durability | `t12` |
| Windows-named-pipe-same-user-capability-protection-real-CRT-DLL-exit-and-lock-release | `t12` |
| manager-terminal-loss-retains-wrapper-child-receipt-with-no-inherited-owner-lock | `t12` |
| both-delivery-modes-use-verified-separate-runtime-store-and-no-host-fallback | `t12` |
| leave-installed-host-v2-daemon-and-host-Ollama-untouched-use-only-isolated-test-homes | `t12` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S004/LLD.md`
- **[[c2]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S004/LLD.md#2-contract-details`
- **[[c3]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S004/LLD.md#3-data-model-changes`
- **[[c4]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S004/LLD.md#3-data-model-changes`
- **[[c5]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S004/LLD.md#6-error-paths`
- **[[c6]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S004/LLD.md#5-interaction-with-shared-contracts`
- **[[c7]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S004/LLD.md#3-data-model-changes`
- **[[c8]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S004/LLD.md#7-test-strategy`
