<!-- insrc:artifact PLAN-8a036e6436ae82ab-s1 -->

# Plan: STORY-8a036e6436ae82ab-s1

## Summary

**Epic:** `pilot-prebuilt-macos-daemon-releases`
**LLD run:** `wf-1794639851378-gchapf`
**LLD effective hash:** `e47bf71ad6dd...`

Implement an opt-in Apple Silicon build and release path, with all testing run locally and publication limited to the qualified artifact.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Build a macOS arm64 candidate | M | — | — | integration: Candidate layout and build-only workflow | [[c1]] |
| 2 | **`t2`** Implement release metadata and bootstrap trust | M | — | — | integration: Bootstrap checksum and signature/target trust | [[c2]] |
| 3 | **`t3`** Verify and stage daemon bundles | M | — | `t1`, `t2` | integration: Archive path and digest rejection | [[c3]] |
| 4 | **`t4`** Integrate fresh install, migration, and rollback | L | — | `t3` | integration: Fresh activation, legacy handoff, floor and offline crash recovery | [[c4]] |
| 5 | **`t5`** Qualify candidates locally | M | — | `t4` | live: Isolated Apple Silicon exact-archive lifecycle | [[c5]] |
| 6 | **`t6`** Promote the exact qualified candidate | M | — | `t5` | integration: Promotion controls, evidence binding and no rebuild | [[c6]] |

### 1.1 TASK-8a036e6436ae82ab-s1-t1 — Build a macOS arm64 candidate

Package pinned Node, runtime files and native bits and add the Actions candidate build and upload.

**Acceptance checks:**
- Exact protected input commit and version appear in build metadata; candidate artifact identity and digest are recorded.
- Actions runs build only; local packaging checks verify runtime layout and portability.

### 1.2 TASK-8a036e6436ae82ab-s1-t2 — Implement release metadata and bootstrap trust

Define bounded manifest and qualification schemas, signature verification, and pinned bootstrap distribution.

**Acceptance checks:**
- An independently supplied bootstrap checksum is required; rejected manifest signature, target, and schema stop before archive execution.
- Test and production keys and namespaces are separate.

### 1.3 TASK-8a036e6436ae82ab-s1-t3 — Verify and stage daemon bundles

Implement archive verification and extraction under a private same-volume staging directory; capture the relocated runtime pin.

**Acceptance checks:**
- Size/digest and archive path/type/permission validation reject invalid bundles without touching active state.
- Staged runtime identity includes manifest, archive and relocated file fingerprints.

### 1.4 TASK-8a036e6436ae82ab-s1-t4 — Integrate fresh install, migration, and rollback

Wire fresh and upgrade admission, compatibility checks, durable release proofs and sequence floor into managed lifecycle and recovery.

**Acceptance checks:**
- Fresh install needs no predecessor; migrates compatible clone state and leaves unsafe predecessors untouched.
- Offline recovery reads old and new journals, restores only pinned predecessor and does not lower the floor.

### 1.5 TASK-8a036e6436ae82ab-s1-t5 — Qualify candidates locally

Add the protected candidate signer, isolated Mac qualification procedure and evidence record.

**Acceptance checks:**
- Local qualification uses the production verification path in its separate test trust domain; validates fresh install, migration, restart and rollback.
- Evidence records all required passes and binds commit, version, manifest, run, artifact and archive.

### 1.6 TASK-8a036e6436ae82ab-s1-t6 — Promote the exact qualified candidate

Add protected promotion that signs the verified manifest and publishes the same asset as an opt-in prerelease; document recovery and key rotation.

**Acceptance checks:**
- Promotion binds the approved protected revision, rechecks evidence/identity and rejects changed or expired assets; no rebuild or hosted tests.
- Production signs identical manifest bytes; no default installer change or publication during implementation.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| ac1 | `t1` |
| ac2 | `t4`, `t5` |
| ac3 | `t2`, `t3`, `t4`, `t5`, `t6` |
| Local malicious-manifest, archive entry, and digest mismatch fixtures | `t2`, `t3` |
| Local workflow lint and protected-input/promotion tests | `t1`, `t5`, `t6` |
| Fresh install, clone migration with state, supervisor restart, rollback after failed upgrade | `t4`, `t5` |
| Verify installed runtime needs no host Git, npm or compiler | `t1`, `t4`, `t5` |

## 3. References

- **[[c1]]** `doc` `docs/standalone/pilot-prebuilt-macos-daemon-releases-E202611148a036e64/S001/LLD.md:34`
- **[[c2]]** `doc` `docs/standalone/pilot-prebuilt-macos-daemon-releases-E202611148a036e64/S001/LLD.md:91`
- **[[c3]]** `doc` `docs/standalone/pilot-prebuilt-macos-daemon-releases-E202611148a036e64/S001/LLD.md:91`
- **[[c4]]** `doc` `docs/standalone/pilot-prebuilt-macos-daemon-releases-E202611148a036e64/S001/LLD.md:176`
- **[[c5]]** `doc` `docs/standalone/pilot-prebuilt-macos-daemon-releases-E202611148a036e64/S001/LLD.md:53`
- **[[c6]]** `doc` `docs/standalone/pilot-prebuilt-macos-daemon-releases-E202611148a036e64/S001/LLD.md:72`
