<!-- insrc:artifact PLAN-c3d71313f34bce71-s1 -->

# Plan: STORY-c3d71313f34bce71-s1

## Summary

**Epic:** `reliable-cross-platform-daemon-installation-lifecycle`
**LLD run:** `wf-1795455251260-labsoi`
**LLD effective hash:** `acb12724c316...`

Build the shared bundle-installer foundation around a pinned private runtime, strict release validation and one durable operation controller. Eight ordered tasks add native locking, release publishing, safe candidate preparation and terminal-owned setup that hands off to the installed TUI only after readiness and lock release. Dependency, lifecycle and migration execution remain required sibling ports; fixture coverage cannot certify a production install. Final live acceptance remains contingent on those sibling implementations and per-target qualification, and the existing host v2 daemon stays untouched.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define installer contracts and installation location resolution | M | — | — | unit: strict installer schemas reject invalid target runtime entrypoint hook and bridge records; unit: explicit home endpoint and terminal launch identity remain consistent; integration: correlated bridge send cancel write outcomes preserve uncertainty; integration: bridge hello ready requires exact nonce within three seconds before dispatch | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Implement native operation locking and atomic controller storage | L | — | `t1` | integration: OS lock excludes another writer and releases on owned fixture self exit; integration: atomic replacement crash points preserve one valid snapshot; smoke: target private runtime loads qualified native lock and atomic adapters | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** Publish pinned private-runtime bootstrap assets | L | — | `t1`, `t2` | integration: bootstrap rejects corrupt wrong target runtime and missing extraction prerequisites; integration: bootstrap works with missing or wrong host Node and clears Node injection; unit: private runtime policy matches native headers and preserves explicit CUDA setting | [[c1]] [[c2]] [[c3]] |
| 4 | **`t4`** Build target-specific bundle and canonical installer release assets | L | — | `t1`, `t2`, `t3` | integration: publisher binds exact source target runtime inventory and independent archive digest; integration: production payload closure rejects missing entrypoints and escaping workspace links; integration: bundled manager excludes DB indexer model imports and consumer npm build; live: published manual and both IDE installer script assets have exact byte parity | [[c1]] [[c2]] [[c3]] [[c4]] |
| 5 | **`t5`** Prepare immutable bundle candidates with bounded safe extraction | L | — | `t1`, `t2`, `t3`, `t4` | integration: hostile ZIP corpus cannot escape staging or exceed bounded extraction; integration: download digest target runtime cancellation and retry preserve incumbent | [[c1]] [[c2]] [[c3]] |
| 6 | **`t6`** Implement the manager operation controller and required peer admission | L | — | `t1`, `t2`, `t5` | integration: install is rejected even with a forged source/bootstrap marker; integration: required peer admission and exact offer state transitions fail closed; integration: manager death and candidate journal receipt projections cannot start duplicate runner; integration: corrupt controller revisions and immutable candidate mismatches fail closed | [[c1]] [[c2]] [[c3]] [[c5]] [[c6]] |
| 7 | **`t7`** Route same-operation immediate escalation to the lock owner | M | — | `t1`, `t2`, `t6` | integration: cross window immediate forwards while owner lock remains held; integration: duplicate stale wrong phase and dead owner escalation preserve exact completion nonce | [[c1]] [[c2]] [[c3]] [[c5]] |
| 8 | **`t8`** Complete terminal-owned installation and installed TUI handoff | L | — | `t3`, `t4`, `t5`, `t6`, `t7` | integration: terminal installer requires all TTY streams and absent dev adapter fails explicitly; integration: ready commit and lock release precede same terminal installed TUI; integration: cancel install failure and post install TUI error preserve correct outcome; integration: assemble actual complete foundation payload only after all entrypoints exist; smoke: canonical POSIX and PowerShell terminal scripts preserve I O and success handoff; live: enabled target clean install and successor upgrade use real peers and exact IPC readiness; live: real migration failure blocks startup and successful installed TUI exit leaves daemon running | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] |

### 1.1 TASK-c3d71313f34bce71-s1-t1 — Define installer contracts and installation location resolution

Create foundation-owned strict schemas/types for sc1/sc2/sc3/sc5/sc6/sc7, including approved escalation and bridge handshake/control envelopes. Implement the pure explicit-home/endpoint resolver and release-policy validation; do not wire daemon boot or IDE transports.

**Acceptance checks:**
- Validate untrusted manifests, entrypoint/module containment, unique ordered hook identities, version/target/predecessor identity and bounded protocol records; reject unknown/incompatible input before execution.
- Resolve one stable installation/user-scoped endpoint from default or explicit absolute home; reject unsupported/network/symlinked controller roots and overlong socket paths without truncation.
- Keep current application IPC payloads intact; define dependency/bridge/hook contracts without implementing s3/s4/s5/s7 behavior.

### 1.2 TASK-c3d71313f34bce71-s1-t2 — Implement native operation locking and atomic controller storage

Add the minimal release-built Node-API v8 platform binding for non-inheritable flock/LockFileEx handles, platform atomic replacement and user-SID lookup. Implement versioned single-writer controller snapshots and read-only missing/corrupt inspection.

**Acceptance checks:**
- Mutations require one OS-held lock; never rename/unlink operation.lock, inspect PIDs, steal by age or create a heartbeat ownership protocol.
- Atomically replace and durably flush snapshots through qualified platform adapters; active release and operation publish together with revision checks.
- Native addons are built on release/development machines, packaged per target and never compiled on a bundle consumer; unavailable target qualification remains explicit.
- Implement each declared platform adapter; execute host-native exclusion/self-exit/atomic-replace crash checks and record other-target smoke as qualified or unavailable. Enforce per-target publication gating while s8 retains live E2E evidence ownership.

### 1.3 TASK-c3d71313f34bce71-s1-t3 — Publish pinned private-runtime bootstrap assets

Create canonical scripts/install.sh and scripts/install.ps1 plus release-owned Node 22.22.1/matching npm policy. Implement download/hash/staged extraction of exact official runtime assets and separately digest-bound bootstrap/native control assets without host Node.

**Acceptance checks:**
- Use independently verified official per-target archive hashes and absolute private executables; reject missing prerequisites, corrupt/wrong-target runtime and Node injection variables without elevation or PATH-runtime fallback.
- Stage/publish runtime and control assets without overwriting running operation code; use matching npm-cli.js through private Node only on build/dev machines.
- No global PATH edit, system service, execution-policy bypass, signing claim or end-user npm/compiler requirement; preserve explicit CUDA-install environment value and default skip only when absent.

### 1.4 TASK-c3d71313f34bce71-s1-t4 — Build target-specific bundle and canonical installer release assets

Create scripts/package-installer.mjs and coordinated publishing integration. Emit release.json sidecar, immutable inventory/ZIP, production dependency closure, built daemon/TUI/assets, release-built native lock binding, official runtime archive and single-file dependency-minimal manager/installer bootstrap.

**Acceptance checks:**
- Exact source revision/target/runtime/protocol/compatibility and file inventory are bound to independent sidecar archive digests; no hash contains its own bytes.
- Use pinned explicit ZIP-reader/bundling dependencies and existing build coordination; preserve native optional dependency closure, safely dereference only verified in-root links and retain daemon/TUI resources.
- Emit identical manual/VS Code/JetBrains script version/hash/bytes via existing resource-copy boundary without implementing native IDE terminal APIs or restoring retired names.
- Run representative native/runtime payload probes before advertising a target; unavailable targets remain unqualified and cannot be published as supported.
- Early publisher tests use explicitly labeled controlled payload fixtures only. Production packaging rejects absent real manager/installer/daemon/TUI entrypoints; final actual payload assembly occurs after t6/t8 implementation.

### 1.5 TASK-c3d71313f34bce71-s1-t5 — Prepare immutable bundle candidates with bounded safe extraction

Implement bundle delivery resolution/download, sidecar/schema/inventory checks and streaming bounded ZIP staging/publication using the approved yauzl reader. Return the common prepared candidate without selecting or starting it.

**Acceptance checks:**
- Reject traversal/drive/UNC/ADS/backslash ambiguities, symlinks/special files, duplicates/case collisions, encryption/unsupported entries and entry/byte/ratio/size violations before unsafe execution/publication.
- Check all runtime/target/predecessor/entrypoint and inventory identities; never run npm/build on consumers or silently switch bundle to dev.
- Download/cancel/build-input failures clean only owned staging and preserve incumbent selection/data/running intent; retry revalidates the exact immutable candidate.

### 1.6 TASK-c3d71313f34bce71-s1-t6 — Implement the manager operation controller and required peer admission

Implement inspect/check-upgrade and serialized mutation state transitions over the controller snapshot. Define required sibling capability ports and durable candidate/admission metadata; use deterministic peers to exercise handoffs without implementing their owned behavior.

**Acceptance checks:**
- Ordinary manager rejects install even with a forged source/bootstrap marker; interactive installation has a separate TTY-only entrypoint.
- Before disruption require actual dependency, lifecycle/readiness and migration ports; missing capability is capability-unavailable, never fixture/no-op production success.
- Own controller.json exclusively; candidate owns hook journal and wrapper owns migration receipt. Persist operation/session/nonce/receipt-path admission before spawn and consume s4/s5 evidence through ports.
- Keep uncertain quiescing/migration/activation blocked; exact-offer acceptance, candidate compatibility, revision checks and explicit same-candidate recovery prohibit automatic predecessor restart, guessed exit or duplicate runners.

### 1.7 TASK-c3d71313f34bce71-s1-t7 — Route same-operation immediate escalation to the lock owner

Implement the approved sc2 escalation forwarding/control lane within the short-lived manager. Preserve ordinary mutation exclusion while allowing an explicit same-operation immediate message to reach the live lock owner during drain.

**Acceptance checks:**
- Use protected installation/operation/owner-session-bound endpoint discovery and same-user authorization; stale/wrong-phase/wrong-identity requests fail.
- Owner remains responsive while waiting; duplicate/cross-window immediate intent coalesces and uses the original s4 instance/completion endpoint/nonce. Forwarder never mutates snapshots or steals/releases the owner lock.
- Absent owner returns escalation-unavailable/uncertain and requires explicit reconciled recovery; never use PID/kill/signal fallback, timer-based escalation or competing replacement.

### 1.8 TASK-c3d71313f34bce71-s1-t8 — Complete terminal-owned installation and installed TUI handoff

Compose canonical scripts, private runtime, bundle preparation and required peer ports into the interactive terminal installer. Publish the installed launcher selecting a complete immutable manager/runtime pair and perform the ready-to-TUI foreground handoff.

**Acceptance checks:**
- TTY stdin/stdout/stderr own mode/source selection, exact dependency consent, progress/errors and recommendations; never accept IDE-filled consent or a direct IDE install request.
- Only validated exact-ready completion may commit ready, release mutation lock and start installed TUI in the same terminal using private runtime; TUI exit leaves daemon running and returns shell.
- Failure/cancel never launches TUI; post-success TUI launch error retains completed install and prints the exact retry command without reinstall/rollback.
- Cross-window busy/duplicate/terminal-close cases preserve one operation and no automatic relaunch. Keep source scripts/insrc distinct from the installed launcher and keep the host v2 daemon untouched.
- Dev selection only captures validated delivery and requires the s2 adapter; absent dev/dependency/lifecycle/migration capability fails explicitly without invented sibling behavior.
- After all s1 entrypoints land, assemble/probe the actual complete payload through t4 tooling. Fixture results remain labeled and no production E2E/install or unqualified-platform success is inferred.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Strict manifest/runtime/entrypoint/hook validation; unrelated design-corpus ReleaseManifest is not imported. | `t1` |
| Manager JSON install is rejected even with a forged source/bootstrap marker; non-TTY interactive entry is rejected. | `t6`, `t8` |
| Explicit home/endpoint and terminal launch schema preserve operation/release identity. | `t1`, `t8` |
| Immutable safe ZIP preparation and inventory verification, including ZIP traversal/ADS/case collision/symlink/oversize/truncation attacks. | `t5` |
| Native lock exclusion/release and atomic-replace crash points with fixture processes that self-exit on control input. | `t2` |
| Prepare/peer-quiesce/peer-migrate/peer-ready transitions; missing capabilities, uncertainty and first-data-write failures remain blocked. | `t6` |
| Complete state and release lock before TUI fixture enters foreground; TUI fixture exit/failure leaves ready installation and peer daemon alive. | `t8` |
| Cross-window immediate forwarding while lock stays held: duplicates, stale endpoint, owner death and same completion nonce. | `t7` |
| Manager self-exit at journal crash points; live candidate completion; held/unknown lease; stale session/revision; no duplicate hook runs. | `t6` |
| Correlated protocol-2 send/cancel/write-boundary contract fixtures; actual Windows binding belongs to s7. | `t1` |
| Protocol-2 hello/ready with exact nonce, three-second deadline, no application send before ready, old-helper/malformed/duplicate/early frame failures. | `t1` |
| Exact Node version/architecture and native lock addon under each target's shipped runtime. | `t2`, `t3` |
| Shared POSIX/PowerShell scripts preserve direct TTY I/O, report failure/cancel and successful same-terminal TUI handoff. | `t3`, `t8` |
| Bundled manager has no application DB/index/model imports; bundle consumer performs no npm/source build. | `t4` |
| Clean install and successor upgrade with actual bundle/native dependencies and IPC readiness on every enabled target. | `t4`, `t8` |
| Both IDE scripts have exact byte parity with manual release script; terminal frontend integration belongs to s6/s7. | `t4` |
| Migration refusal/failure blocks actual startup and upgrade; real TUI uses selected daemon and exits without stopping it. | `t6`, `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/LLD.md#2-contract-details`
- **[[c2]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/LLD.md#3-data-model-changes`
- **[[c3]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/LLD.md#6-error-paths`
- **[[c4]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/LLD.md#7-test-strategy`
- **[[c5]]** `prior-artifact` `.insrc/artifacts/AMD-c3d71313f34bce71-1.json`
- **[[c6]]** `prior-artifact` `.insrc/artifacts/AMD-c3d71313f34bce71-3.json`
