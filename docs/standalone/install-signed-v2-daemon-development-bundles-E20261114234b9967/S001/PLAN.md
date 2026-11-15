<!-- insrc:artifact PLAN-234b9967599e56d9-s1 -->

# Plan: STORY-234b9967599e56d9-s1

## Summary

**Epic:** `install-signed-v2-daemon-development-bundles`
**LLD run:** `wf-1794675127236-yn078m`
**LLD effective hash:** `766c01ae27f8...`

Build signed daemon development bundles locally from project-configured branch refs. Integrate a separate development trust domain with the managed macOS lifecycle, then validate installation and recovery in a dedicated Apple Silicon VM. The hosted unsigned lane uses separate admission and publication jobs and can be enabled after the local path is verified.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Development policy and manifest | M | — | — | unit: Canonical development manifest, branch policy and wrong-domain proof rejection | [[c1]] [[c2]] |
| 2 | **`t2`** Local exact-commit packaging | M | — | `t1` | integration: Local clean branch fetch, exact commit and measured candidate with no main dispatch | [[c1]] [[c3]] |
| 3 | **`t3`** Local signing and upgrade qualification | M | — | `t2` | integration: Authenticated signing handoff, sequence allocation, writable format and crash-reopen qualification | [[c1]] [[c2]] [[c3]] |
| 4 | **`t4`** Managed development proof and sequence floor | M | — | `t1` | unit: Development proof and reservation floor, rollback and equal-sequence byte identity | [[c2]] [[c4]] |
| 5 | **`t5`** Development bootstrap and isolated first activation | M | — | `t2`, `t4` | integration: Authenticated bootstrap fixture and host, archive and foreign-state refusal | [[c2]] [[c4]] [[c5]] |
| 6 | **`t6`** Managed development update and rollback | M | — | `t3`, `t5` | integration: Exact predecessor, cross-branch state, idle intent and offline rollback | [[c2]] [[c4]] [[c5]] |
| 7 | **`t7`** First-install recovery | M | — | `t5` | integration: Crash before selector, after job and before receipt, with foreign or live ownership refusal | [[c2]] [[c4]] [[c5]] |
| 8 | **`t8`** Local deployment verification and operator docs | M | — | `t6`, `t7` | live: Dedicated Apple Silicon macOS VM build, install, MCP/CLI readiness, restart, upgrade and rollback | [[c5]] [[c6]] |
| 9 | **`t9`** Later rollout of hosted candidate publication | M | — | `t8` | integration: Hosted provenance fixture checks protected ref, isolated publisher, exact run attempt, artifact ID and measured digest | [[c1]] [[c6]] |

### 1.1 TASK-234b9967599e56d9-s1-t1 — Development policy and manifest

Define authenticated allowed refs, canonical manifest, signature, target and staging adapter.

**Acceptance checks:**
- Unsigned or wrong-domain proof and invalid ref/target fail before activation.
- Production and qualification formats stay accepted only by existing policy.

### 1.2 TASK-234b9967599e56d9-s1-t2 — Local exact-commit packaging

Implement configured branch fetch, clean build and candidate handoff with measured archive and runtime identity.

**Acceptance checks:**
- Configured refs work without main or hosted dispatch.
- Unlisted, tag, stale or unreachable input and dirty checkout refuse.

### 1.3 TASK-234b9967599e56d9-s1-t3 — Local signing and upgrade qualification

Bind signing handoff and allocated sequence to exact bytes. Qualify predecessor and candidate writable formats and interrupted reopen before signing.

**Acceptance checks:**
- Signing refuses mismatched authenticated provenance or duplicate sequence bindings.
- Upgrade proof binds exact predecessor, candidate and local compatibility evidence.

### 1.4 TASK-234b9967599e56d9-s1-t4 — Managed development proof and sequence floor

Add dev proof and repository/channel floor in journal, admission and re-verification. Keep production trust domains separate.

**Acceptance checks:**
- Atomic reservation keeps admission floor after rollback and rejects conflicting same-sequence bytes.
- Restart/recovery verify exact pinned contents and preserve existing production records.

### 1.5 TASK-234b9967599e56d9-s1-t5 — Development bootstrap and isolated first activation

Implement authenticated bootstrap and preflight for a dedicated Apple Silicon macOS VM and controller dispatch for fresh activation.

**Acceptance checks:**
- Fresh install checks trusted policy, host/runtime and archive before activation.
- Foreign state and invalid proof leave service and data untouched.

### 1.6 TASK-234b9967599e56d9-s1-t6 — Managed development update and rollback

Apply exact predecessor qualification, quiesced-store inspection, idle/running intent and durable update/rollback.

**Acceptance checks:**
- Cross-ref upgrade preserves state and floor and requires an exact compatible predecessor.
- Interrupted update restores authenticated exact predecessor offline or fails closed.

### 1.7 TASK-234b9967599e56d9-s1-t7 — First-install recovery

Recover authenticated orphaned first-install reservations without an installed receipt. Reconcile exact selector, process, job and state effects.

**Acceptance checks:**
- Recover before selector, after launchd registration and after readiness. Refuse foreign state and retained live ownership.

### 1.8 TASK-234b9967599e56d9-s1-t8 — Local deployment verification and operator docs

Document policy configuration, VM, build/sign, install, update, recovery and hosted rollout boundary. Run local acceptance tests against signed bundles.

**Acceptance checks:**
- Fresh install, restart and branch switch work in a dedicated VM.
- Offline rollback, incompatible upgrade and protected-state refusal are verified locally.

### 1.9 TASK-234b9967599e56d9-s1-t9 — Later rollout of hosted candidate publication

Add protected workflow admission and separate fresh-runner publication of unsigned artifacts. Enable after protected workflow deployment and rollout verification.

**Acceptance checks:**
- Official receipt binds run, attempt, admitted ref and SHA, artifact ID, and independent digest without running candidate code.
- Branch-local runs, forged receipts and wrong-attempt artifacts are rejected.
- Hosted rollout checks run locally against fixtures. Deployment and enablement are separate from the local install gate.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Build provenance and exact archive/runtime verification | `t1`, `t2`, `t3`, `t8` |
| Dev signature accepted only in dev; release signature accepted only in correct lane | `t1`, `t4`, `t5`, `t9` |
| Existing non-dev state untouched | `t5`, `t7`, `t8` |
| Fresh install, MCP/CLI connection, restart, newer dev update and forced rollback offline | `t6`, `t7`, `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/standalone/install-signed-v2-daemon-development-bundles-E20261114234b9967/S001/LLD.md#21-build-development-bundle`
- **[[c2]]** `prior-artifact` `docs/standalone/install-signed-v2-daemon-development-bundles-E20261114234b9967/S001/LLD.md#3-data-model-changes`
- **[[c3]]** `prior-artifact` `docs/standalone/install-signed-v2-daemon-development-bundles-E20261114234b9967/S001/LLD.md#6-test-strategy`
- **[[c4]]** `prior-artifact` `docs/standalone/install-signed-v2-daemon-development-bundles-E20261114234b9967/S001/LLD.md#22-install-or-update-development-bundle`
- **[[c5]]** `prior-artifact` `docs/standalone/install-signed-v2-daemon-development-bundles-E20261114234b9967/S001/LLD.md#5-error-paths`
- **[[c6]]** `prior-artifact` `docs/standalone/install-signed-v2-daemon-development-bundles-E20261114234b9967/S001/LLD.md#7-migration`
