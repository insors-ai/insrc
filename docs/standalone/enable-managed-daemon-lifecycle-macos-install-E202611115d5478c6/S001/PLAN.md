<!-- insrc:artifact PLAN-5d5478c61a25ac8f-s1 -->

# Plan: STORY-5d5478c61a25ac8f-s1

## Summary

**Epic:** `enable-managed-daemon-lifecycle-macos-install`
**LLD run:** `wf-1794555514618-2phz13`
**LLD effective hash:** `a1f870fbe4e8...`

Authenticate each promoted macOS source head with one signed Git tag. Build on the user’s machine and keep the exact incumbent bytes for guarded rollback. Exercise the installer and IDE routes with disposable keys, then run the full regression sweep after implementation. Production packaging uses the release team’s public signing key.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Stage and qualify pinned macOS releases | M | approved r1 | — | unit: Release provenance, changed bytes and absent legacy declaration; integration: Staging leaves the installed release executable and unchanged | [[c1]] [[c6]] |
| 2 | **`t2`** Activate the supervisor on fresh install | M | approved r1 | `t1` | unit: Explicit fresh activation start intent and owned partial publication; integration: Fresh controller activation reconciles partial selector and bootstrap | [[c1]] [[c2]] |
| 3 | **`t3`** Identify and fence legacy launch routes | M | approved r1 | `t1` | unit: Predecessor variants and backward decoding; integration: Old shell/helper concurrent with canonical launcher exchange and old child attempting to open stores | [[c3]] [[c5]] [[c6]] |
| 4 | **`t4`** Transfer the run-file guard without a gap | M | approved r1 | `t3` | unit: Graceful, broker-denied and unknown drain evidence; integration: Guard adoption binds exact identities and recovers on either side of transfer | [[c3]] [[c4]] [[c5]] |
| 5 | **`t5`** Commit or roll back legacy migration | M | approved r1 | `t2`, `t3`, `t4` | unit: Uncertain publication with durable success versus no outcome; integration: Startup guard transfer, candidate bootstrap failure, rollback and repeated recovery; integration: Rollback restores an idle job without launching and refuses unqualified RunAtLoad | [[c2]] [[c3]] [[c4]] [[c5]] |
| 6 | **`t6`** Wire running and stopped daemon updates | M | approved r1 | `t1`, `t5` | integration: Running managed update IPC and stopped local managed update; integration: Managed update acknowledges before slow preparation and survives client disconnect | [[c3]] [[c6]] [[c7]] |
| 7 | **`t7`** Wire normal IDE first-upgrade actions | M | approved r1 | `t6` | integration: Installer and updated CLI, VS Code and JetBrains route matrix | [[c6]] [[c7]] |
| 8 | **`t16`** Verify signed Git source before checkout | L | — | `t1`, `t7` | integration: Only an authorized channel tag can reach checkout and npm; integration: Installer and updated CLI, VS Code and JetBrains route matrix | [[c1]] [[c2]] |
| 9 | **`t17`** Stage tagged compatibility and exact local runtime pins | L | — | `t16`, `t5`, `t6` | integration: Changed local runtime bytes block cutover or offline rollback; integration: Tagged compatibility rejects a conflicting declaration and admits a known historical predecessor; integration: Running managed update IPC and stopped local managed update | [[c1]] [[c2]] [[c3]] |
| 10 | **`t13`** Gate restored legacy lifecycle requests | L | approved r1 | `t5`, `t17` | integration: A competing legacy command and interruption during rollback cannot reopen the launcher before durable outcome; integration: Real restored legacy update and shutdown RPCs cannot interrupt rollback or a managed retry; integration: Idle public stop and authorized private drain require distinct admission and reconcile exact exit | [[c1]] [[c2]] [[c3]] |
| 11 | **`t14`** Reserve restored upgrades before preparation | M | approved r1 | `t13`, `t17`, `t6` | integration: A restored installer reserves before source fetch or build and releases admission on preparation failure; integration: Managed acknowledgement precedes a preparation exceeding the client deadlines and lost reply cancels only unstarted work | [[c1]] [[c2]] |
| 12 | **`t18`** Gate signed-source release promotion | M | — | `t14`, `t17` | integration: Promotion requires passing source-built evidence for the exact signed head; integration: Published installer and both IDEs embed the same trusted verifier | [[c1]] [[c3]] |
| 13 | **`t8`** Qualify local install, migration and rollback | L | draft r2 | `t2`, `t5`, `t6`, `t7`, `t14`, `t18` | integration: Linux normal install, update and restart unchanged; smoke: Fresh install and verified ordinary restart; smoke: Fresh --no-start and later supervisor start; smoke: First supported update of a qualified prior build with broker denial; smoke: Direct install and passive recovery job with exact loader argv; smoke: Verified stopped and running rollback with configuration and store integrity; smoke: Real product passive and recovery job loader arguments, verified broker refusal, data-preserving rollback and subsequent managed update; smoke: Source-built macOS migration preserves running and stopped service intent; smoke: Restored rollback guards public lifecycle and admits private retry | [[c1]] [[c3]] |

### 1.1 TASK-5d5478c61a25ac8f-s1-t1 — Stage and qualify pinned macOS releases

Prepare a candidate beside the installed release using the configured origin and preserve an executable rollback pin.

**Acceptance checks:**
- Candidate staging does not mutate the legacy checkout, runtime, dependencies or state.
- Trusted compatibility evidence pins both releases, including qualified old releases without declarations. Unqualified or changed predecessors fail before shutdown.

### 1.2 TASK-5d5478c61a25ac8f-s1-t2 — Activate the supervisor on fresh install

Journal fresh activation and route normal installation through it.

**Acceptance checks:**
- A fresh install registers exactly one supervisor and verifies its child readiness. --no-start registers a usable idle supervisor.
- Failure or interruption reconciles the selector, descriptor, job and optional child by identity.

### 1.3 TASK-5d5478c61a25ac8f-s1-t3 — Identify and fence legacy launch routes

Discover a qualified predecessor and isolate the canonical launcher before cutover.

**Acceptance checks:**
- Verified direct, passive job, temporary recovery job and stopped predecessors carry exact pins and compatible journal variants.
- An already-running legacy helper, foreign job, unknown path or descriptor conflict refuses cutover before shutdown. The journaled dispatcher exchange can be resumed or reversed.

### 1.4 TASK-5d5478c61a25ac8f-s1-t4 — Transfer the run-file guard without a gap

Define authenticated transfer, receipts, and recovery across exact predecessor exit and supervisor startup.

**Acceptance checks:**
- The old process exits with independent incarnation evidence. Graceful, broker-denied and unknown outcomes are distinguished only with correlated evidence.
- The supervisor adopts the exact guard without releasing it in between. Old handles cannot mutate it. Crashes before and after transfer are recoverable, including an idle candidate and legacy rollback.
- The transfer binds both incarnations to a durable receipt and proves the former owner cannot use its stale handle.

### 1.5 TASK-5d5478c61a25ac8f-s1-t5 — Commit or roll back legacy migration

Integrate the predecessor variants and guard with the existing transaction.

**Acceptance checks:**
- Candidate startup or idle state is verified before durable success. Unknown terminal publication keeps the fence and resolves the matching durable outcome before rollback decisions.
- Restore the exact previous registration even if it was idle. An idle descriptor that would autostart is refused before mutation unless there is a verified way to preserve idle. Direct rollback restores the previous running state and uses pinned launch settings.

### 1.6 TASK-5d5478c61a25ac8f-s1-t6 — Wire running and stopped daemon updates

Connect shell, TUI and the daemon update endpoint to shared staging and migration.

**Acceptance checks:**
- Running managed update returns a bounded acknowledgement before detached fetch, install or build. Slow preparation can exceed both current deadlines without dropping an admitted update or shutting down the predecessor early.
- Stopped managed update works without daemon IPC and leaves the replacement stopped. The legacy first-upgrade entry stages the bridge before calling old shutdown.
- An unconfirmed acknowledgement cancels bounded admission before preparation or shutdown. Once acknowledged, the detached helper owns preparation and outcome even if the client disconnects.

### 1.7 TASK-5d5478c61a25ac8f-s1-t7 — Wire normal IDE first-upgrade actions

Route VS Code and JetBrains installed update actions through the shared installer bridge on unmanaged macOS.

**Acceptance checks:**
- Updated IDE lifecycle and freshness flows stage the migration before legacy shutdown and report verified outcomes.
- Older callers can use the current normal installer as the first-upgrade entry without manual launchd or file edits. Managed clients keep the existing IPC outcome contract.

### 1.8 TASK-5d5478c61a25ac8f-s1-t16 — Verify signed Git source before checkout

Replace authorization with one pinned SSH signing key, verify the signed channel tag against exact branch head before checkout and journal the channel sequence floor. Reuse the shared installer entry point.

**Acceptance checks:**
- Only a correctly signed annotated tag for the configured channel and exact branch head authorizes checkout. Reject unsigned or malformed tags, foreign signers, wrong target, stale sequence and same-sequence substitution. Permit identical retries. Confirm denied input never reaches npm or a downloaded controller.

### 1.9 TASK-5d5478c61a25ac8f-s1-t17 — Stage tagged compatibility and exact local runtime pins

Read a bounded catalog blob from the verified source tree, check the exact ordered compatibility pair and known historical fallback, and bind exact locally built byte pins to the update. Supersede the unpublished reference inventory, native normalization and delegation code while retaining historical recovery decoding as needed.

**Acceptance checks:**
- Catalog supports only the exact prior commit and authorized launch profile. Verify known writable formats and crash-consistent reopening. Reject conflicting declarations. Require candidate local build and exact raw pins before cutover. Offline recovery uses recorded evidence and original bytes.

### 1.10 TASK-5d5478c61a25ac8f-s1-t13 — Gate restored legacy lifecycle requests

Complete guarded archived rollback, pinned admin preload and distinct public stop and private update drain paths, including the supported shell LaunchAgent transformation.

**Acceptance checks:**
- Only the trusted controller can reconstruct the pinned shell LaunchAgent as the guarded private Node descriptor. Preserve passive policy and launch identity. Both handler tables arbitrate Stop and refuse old Update. Publish verified rollback before opening guarded dispatch.

### 1.11 TASK-5d5478c61a25ac8f-s1-t14 — Reserve restored upgrades before preparation

Arbitrate the restored installer route before fetch or build. Keep the original reservation through qualification and cutover. Preserve managed acknowledgement and recover abandoned preflight.

**Acceptance checks:**
- Stop and Update serialize before restored preparation. Failure releases admission only after checking unchanged live state. Existing managed acknowledgement precedes verification and build.

### 1.12 TASK-5d5478c61a25ac8f-s1-t18 — Gate signed-source release promotion

Verify the exact proposed source head and require real source-built qualification results before signing and promotion. Produce the same packaged verifier for the installer, VS Code and JetBrains. Implement and exercise the gate with fixture evidence. Actual promotion consumes the evidence produced in t8.

**Acceptance checks:**
- Missing or mismatched test evidence blocks promotion. Validate the precise tag and head through the normal fetch route and use the same public verifier configuration in each distribution. Exercise with a disposable signing key.

### 1.13 TASK-5d5478c61a25ac8f-s1-t8 — Qualify local install, migration and rollback

Exercise the real source-built installer against disposable macOS state, preserve Linux behavior, and run the full regression sweep after implementation. Record exact source test evidence for the promotion gate.

**Acceptance checks:**
- Cover fresh start and idle, running and stopped managed updates, broker-denied legacy migration, passive and shell job restoration, rollback with intact stores and later retry. Check normal Linux lifecycle. Run the full regression sweep only after implementation tasks.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Only an authorized channel tag can reach checkout and npm | `t16` |
| Changed local runtime bytes block cutover or offline rollback | `t17` |
| Source-built macOS migration preserves running and stopped service intent | `t8` |
| Restored rollback guards public lifecycle and admits private retry | `t8` |
| Predecessor variants and backward decoding | `t3` |
| Explicit fresh activation start intent and owned partial publication | `t2` |
| Release provenance, changed bytes and absent legacy declaration | `t1` |
| Graceful, broker-denied and unknown drain evidence | `t4` |
| Uncertain publication with durable success versus no outcome | `t5` |
| Installer and updated CLI, VS Code and JetBrains route matrix | `t7`, `t16` |
| Running managed update IPC and stopped local managed update | `t6`, `t17` |
| Old shell/helper concurrent with canonical launcher exchange and old child attempting to open stores | `t3` |
| Startup guard transfer, candidate bootstrap failure, rollback and repeated recovery | `t5` |
| Linux normal install, update and restart unchanged | `t8` |
| Fresh install and verified ordinary restart | `t8` |
| Fresh --no-start and later supervisor start | `t8` |
| First supported update of a qualified prior build with broker denial | `t8` |
| Direct install and passive recovery job with exact loader argv | `t8` |
| Verified stopped and running rollback with configuration and store integrity | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6/S001/LLD.md#2-contract-details`
- **[[c6]]** `prior-artifact` `docs/standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6/S001/LLD.md#7-migration`
- **[[c2]]** `prior-artifact` `docs/standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6/S001/LLD.md#3-data-model-changes`
- **[[c3]]** `prior-artifact` `docs/standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6/S001/LLD.md#6-test-strategy`
- **[[c5]]** `prior-artifact` `docs/standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6/S001/LLD.md#32-updatepredecessor--invariant-change`
- **[[c4]]** `prior-artifact` `docs/standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6/S001/LLD.md#5-error-paths`
- **[[c7]]** `prior-artifact` `docs/standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6/S001/LLD.md#25-launchmanagedupdate`
