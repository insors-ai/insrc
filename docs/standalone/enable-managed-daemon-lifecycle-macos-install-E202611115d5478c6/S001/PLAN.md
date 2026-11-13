<!-- insrc:artifact PLAN-5d5478c61a25ac8f-s1 -->

# Plan: STORY-5d5478c61a25ac8f-s1

## Summary

**Epic:** `enable-managed-daemon-lifecycle-macos-install`
**LLD run:** `wf-1794546820180-mwzp01`
**LLD effective hash:** `792d79af295b...`

Keep the existing macOS supervisor, migration and client work. Add signed release verification, portable native build evidence and a guarded restoration path. Qualify real macOS builds before release promotion and verify Linux compatibility.

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
| 8 | **`t9`** Verify signed release and trust metadata | M | — | `t1` | integration: Trust rotation, expiry, replay and offline rollback at the fence boundary | [[c6]] [[c9]] |
| 9 | **`t10`** Verify the installed runtime inventory | M | — | `t9` | integration: Changed native code, loadable data, bindings, signature policy, injected modules, symlinks and unidentified variance fail closed | [[c5]] [[c9]] |
| 10 | **`t11`** Verify supported native build variance | L | — | `t10` | integration: Independent same-commit macOS build equivalence and tamper rejection; integration: Independent unequal-length debug roots preserve canonical native identity and malformed offsets or codeLimit are rejected | [[c9]] [[c8]] |
| 11 | **`t12`** Authenticate installer and IDE bootstrap | M | — | `t9`, `t11`, `t7` | integration: Invalid or missing authorization prevents bootstrap checkout execution, npm scripts and bridge invocation | [[c1]] [[c9]] |
| 12 | **`t13`** Gate restored legacy lifecycle requests | L | — | `t5`, `t9` | integration: A competing legacy command and interruption during rollback cannot reopen the launcher before durable outcome; integration: Real restored legacy update and shutdown RPCs cannot interrupt rollback or a managed retry; integration: Idle public stop and authorized private drain require distinct admission and reconcile exact exit | [[c3]] [[c4]] [[c5]] |
| 13 | **`t14`** Reserve restored upgrades before preparation | M | — | `t12`, `t13`, `t6` | integration: A restored installer reserves before fetch, build or inventory and releases admission on preparation failure; integration: Managed acknowledgement precedes a preparation exceeding the client deadlines and lost reply cancels only unstarted work | [[c1]] [[c3]] [[c7]] |
| 14 | **`t8`** Qualify install, migration and rollback | L | approved r1 | `t2`, `t5`, `t6`, `t7`, `t14` | integration: Linux normal install, update and restart unchanged; smoke: Fresh install and verified ordinary restart; smoke: Fresh --no-start and later supervisor start; smoke: First supported update of a qualified prior build with broker denial; smoke: Direct install and passive recovery job with exact loader argv; smoke: Verified stopped and running rollback with configuration and store integrity; smoke: Real product passive and recovery job loader arguments, verified broker refusal, data-preserving rollback and subsequent managed update | [[c1]] [[c4]] [[c8]] |
| 15 | **`t15`** Gate promotion on published product qualification | M | — | `t11`, `t12`, `t14`, `t8` | integration: Missing or stale release evidence prevents promotion and leaves the incumbent running; smoke: Release publication validates real running and stopped upgrades for every enabled profile | [[c1]] [[c8]] [[c9]] |

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

### 1.8 TASK-5d5478c61a25ac8f-s1-t9 — Verify signed release and trust metadata

Add the trusted bootstrap verification contract and admission evidence.

**Acceptance checks:**
- Bind source, branch, candidate tree and ordered releases to a scoped signature. Reject invalid, expired, revoked or replayed metadata and retain the durable receipt for offline recovery.

### 1.9 TASK-5d5478c61a25ac8f-s1-t10 — Verify the installed runtime inventory

Measure the complete execution inventory and produce the exact local rollback pin.

**Acceptance checks:**
- Reject unexpected executable files, unsafe links and unsupported optional package layouts. Retain every qualified file in the raw rollback pin and revalidate it at cutover.

### 1.10 TASK-5d5478c61a25ac8f-s1-t11 — Verify supported native build variance

Verify signed reference equivalence for the named native add-ons.

**Acceptance checks:**
- Independent unequal-length build roots verify against the same signed reference. Changed executable data, loader relationships, layout or signature coverage fail closed.

### 1.11 TASK-5d5478c61a25ac8f-s1-t12 — Authenticate installer and IDE bootstrap

Run the trusted first-stage verifier before candidate-controlled execution.

**Acceptance checks:**
- Shell and both IDE installer routes refuse missing or invalid authorization before bridge checkout, npm scripts or bridge execution. Preserve existing fresh and Linux behavior.

### 1.12 TASK-5d5478c61a25ac8f-s1-t13 — Gate restored legacy lifecycle requests

Preserve exact rollback using a guarded adapter, authenticated drain and durable fenced settlement.

**Acceptance checks:**
- A restored process gates both lifecycle RPCs across applicable workers. The private controller drain requires the current reservation and exact peer. Verify restored state and publish rollback before permitting guarded dispatch.

### 1.13 TASK-5d5478c61a25ac8f-s1-t14 — Reserve restored upgrades before preparation

Apply continuous preparation-to-cutover admission to the actual restored installer route.

**Acceptance checks:**
- Arbitrate Stop and Update before fetch or build and preserve the exact incumbent baseline. Cleanly release a failed or abandoned pre-mutation reservation. Preserve managed acknowledgement before slow preparation.

### 1.14 TASK-5d5478c61a25ac8f-s1-t8 — Qualify install, migration and rollback

Exercise supported paths against disposable macOS state and verify Linux behavior.

**Acceptance checks:**
- Fresh install and --no-start, ordinary restart, running and stopped updates, and first upgrade of broker-denied predecessors pass real macOS qualification.
- Interrupted guard adoption, stopped-job rollback and publication ambiguity are verified. User config and state survive. Linux lifecycle remains compatible.
- Record immutable real-product qualification receipts for each enabled profile, using an isolated signer and exercising independent native builds, real running broker denial, stopped and passive routes, and the subsequent managed update.

### 1.15 TASK-5d5478c61a25ac8f-s1-t15 — Gate promotion on published product qualification

Produce and verify release evidence for the product matrix and enforce it before promotion.

**Acceptance checks:**
- Publication verifies the exact release head, signed profiles and immutable real-product receipts from independent builds. Refuse missing or invalid evidence before promotion. Use a disposable signer for tests.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Predecessor variants and backward decoding | `t3` |
| Explicit fresh activation start intent and owned partial publication | `t2` |
| Release provenance, changed bytes and absent legacy declaration | `t1` |
| Graceful, broker-denied and unknown drain evidence | `t4` |
| Uncertain publication with durable success versus no outcome | `t5` |
| Installer and updated CLI, VS Code and JetBrains route matrix | `t6`, `t7` |
| Running managed update IPC and stopped local managed update | `t6` |
| Old shell/helper concurrent with canonical launcher exchange and old child attempting to open stores | `t3`, `t4` |
| Startup guard transfer, candidate bootstrap failure, rollback and repeated recovery | `t4`, `t5` |
| Linux normal install, update and restart unchanged | `t8` |
| Fresh install and verified ordinary restart | `t2`, `t8` |
| Fresh --no-start and later supervisor start | `t2`, `t8` |
| First supported update of a qualified prior build with broker denial | `t6`, `t8` |
| Direct install and passive recovery job with exact loader argv | `t3`, `t8` |
| Verified stopped and running rollback with configuration and store integrity | `t5`, `t8` |
| Trust rotation, expiry, replay and offline rollback at the fence boundary | `t9` |
| Changed native code, loadable data, bindings, signature policy, injected modules, symlinks and unidentified variance fail closed | `t10`, `t11` |
| Independent same-commit macOS build equivalence and tamper rejection | `t11` |
| Independent unequal-length debug roots preserve canonical native identity and malformed offsets or codeLimit are rejected | `t11` |
| Invalid or missing authorization prevents bootstrap checkout execution, npm scripts and bridge invocation | `t12` |
| A competing legacy command and interruption during rollback cannot reopen the launcher before durable outcome | `t13` |
| Real restored legacy update and shutdown RPCs cannot interrupt rollback or a managed retry | `t13` |
| Idle public stop and authorized private drain require distinct admission and reconcile exact exit | `t13` |
| A restored installer reserves before fetch, build or inventory and releases admission on preparation failure | `t14` |
| Managed acknowledgement precedes a preparation exceeding the client deadlines and lost reply cancels only unstarted work | `t14` |
| Real product passive and recovery job loader arguments, verified broker refusal, data-preserving rollback and subsequent managed update | `t8` |
| Missing or stale release evidence prevents promotion and leaves the incumbent running | `t15` |
| Release publication validates real running and stopped upgrades for every enabled profile | `t15` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6/S001/LLD.md#7-migration`
- **[[c2]]** `prior-artifact` `docs/standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6/S001/LLD.md#23-stagemanagedinstallation`
- **[[c3]]** `prior-artifact` `docs/standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6/S001/LLD.md#22-completelegacymigration`
- **[[c4]]** `prior-artifact` `docs/standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6/S001/LLD.md#5-error-paths`
- **[[c5]]** `prior-artifact` `docs/standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6/S001/LLD.md#3-data-model-changes`
- **[[c6]]** `prior-artifact` `docs/standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6/S001/LLD.md#7-migration`
- **[[c7]]** `prior-artifact` `docs/standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6/S001/LLD.md#24-launchmanagedupdate`
- **[[c8]]** `prior-artifact` `docs/standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6/S001/LLD.md#6-test-strategy`
- **[[c9]]** `prior-artifact` `docs/standalone/enable-managed-daemon-lifecycle-macos-install-E202611115d5478c6/S001/LLD.md#21-stagemanagedrelease`
