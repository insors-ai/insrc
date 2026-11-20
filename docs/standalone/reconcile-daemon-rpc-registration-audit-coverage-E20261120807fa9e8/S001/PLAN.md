<!-- insrc:artifact PLAN-807fa9e8fb678f4b-s1 -->

# Plan: STORY-807fa9e8fb678f4b-s1

## Summary

**Epic:** `reconcile-daemon-rpc-registration-audit-coverage`
**LLD run:** `wf-1795173501200-iln8uq`
**LLD effective hash:** `bce6337fee05...`

Complete Batch05 in three ordered tasks: reconcile explicit classifications and independent exact inventories; prove modifying dispatch and worker ownership; update documentation and retain complete coordinated test evidence. Preserve the handler snapshot correction already merged from upstream and validate the merged tree before claiming remaining failure counts.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Reconcile explicit classifications and exact inventory checks | M | — | — | unit: src/daemon/__tests__/repo-call-audit.test.ts — exact constructed RPC/stream and callable phase coverage; valid evidence and repo rules; missing/stale negative controls.; unit: src/daemon/__tests__/repo-call-table.test.ts — exact disjoint table partition and unknown-name control.; unit: src/daemon/threads/__tests__/method-class.test.ts — exact classes/transport, duplicates and drift, explicit retired ownership, worker-safe imports.; unit: src/daemon/__tests__/handler-runtime.test.ts — retain reviewed upstream snapshot additions and full runtime construction coverage. | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Verify modifying dispatch and qualification ownership | M | — | `t1` | integration: src/daemon/__tests__/repo-gate-dispatch.test.ts — exact modifying dispatch coverage, no-write refusal and positive registered feedback append.; integration: src/daemon/__tests__/handler-runtime.test.ts — isolated qualificationState reaches existing unqualified error.; unit: src/daemon/threads/__tests__/method-class.test.ts — qualification ordinary session target, excluding admin/shared/FIFO ownership.; integration: src/daemon/__tests__/repo-call-gate.test.ts and src/daemon/__tests__/step-repo-gate.test.ts — canonical repo/path/token refusal and continuation controls. | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** Reconcile documentation and retain final batch evidence | S | — | `t1`, `t2` | unit: src/daemon/__tests__/daemon-doc-repo-table.test.ts — exact modifying method/parameter and refusal documentation parity.; smoke: Node22 coordinator --concurrency=1 runs all seven baseline files, plus step-repo-gate and directly affected retired-review/router regressions as needed; retain whole-file results and confirmed child cleanup under docs/plans. | [[c1]] [[c3]] [[c4]] |

### 1.1 TASK-807fa9e8fb678f4b-s1-t1 — Reconcile explicit classifications and exact inventory checks

Reconcile missing rows in src/daemon/repo-call-audit.ts and src/daemon/threads/method-class.ts against current callable handlers and phase schemas. Class qualificationState as unary session/read-only; retain retired-review no-work boundary and explicit main-daemon overrides. Replace regex-only registration discovery and filename-only phase inference in the audit/table tests with independent constructed runtime and callable-contract inventories. Preserve the upstream handler snapshot fix. Strengthen method-class drift and explicit retired-review ownership checks.

**Acceptance checks:**
- qualificationState has an evidenced read-only audit entry and unary ordinary session class; it is absent from shared-state and FIFO-exempt sets.
- design-review-step.cancel and any other callable phase omissions receive evidence-based classifications, with no stale phase rows or deleted review execution restored.
- No IPC shape, store schema, repo fallback, worker runtime import or public failure behavior changes.
- Audits exactly cover the merged RPC/stream maps and callable phases, with valid evidence and disjoint modifying/nonmodifying partition.
- Independent negative controls fail for missing/stale/unknown keys, duplicate classification entries and wrong stream flags; no blanket family exemptions.
- Upstream handler snapshot additions remain intact; full handler-runtime file passes without regenerating expected keys from the table under test.
- Retired-review ownership checks use the exact main-daemon override sets and current router precedence; supported shared-state families still route correctly.

### 1.2 TASK-807fa9e8fb678f4b-s1-t2 — Verify modifying dispatch and qualification ownership

Replace the fixed modifying-method minimum in src/daemon/__tests__/repo-gate-dispatch.test.ts with exact identity coverage. Preserve positive registered writes and existing refusal controls; verify qualificationState dispatch and directly affected ownership/refusal boundaries in isolated fixtures. Put the isolated unqualified qualificationState control in src/daemon/__tests__/handler-runtime.test.ts and class/target assertions in src/daemon/threads/__tests__/method-class.test.ts.

**Acceptance checks:**
- Every modifying registered RPC/stream is exercised and counted by exact name; missing repo returns existing refusal without filesystem changes even with conflicting cwd/environment.
- Positive artifact.feedback.append still writes only the named registered repository; all repository gate tests and supported token/path controls pass.
- An isolated full-runtime qualificationState call reaches its existing unqualified error, not an unknown-method or fabricated success; class/route evidence excludes the admin-only map and shared-state owner.
- Directly affected retired-review dispatcher/router controls preserve local no-work refusal without provider calls, worker allocation or writes. Tests use managed children and no installed live stores.

### 1.3 TASK-807fa9e8fb678f4b-s1-t3 — Reconcile documentation and retain final batch evidence

Update docs/daemon.md repository gate table to current audited modifying methods, retaining repo parameter/refusal explanations. Run the seven affected files serially on the merged tree plus directly affected regressions, and record evidence in docs/plans and batch/failure indexes.

**Acceptance checks:**
- Documented modifying names and repo parameters exactly match FILE_MODIFYING_METHODS and retain all six refusal codes and no-fallback explanation.
- Complete affected files pass through Node22 coordinator with build/source-output ownership, accounted results, no timeout/cancel/skip concealment and confirmed child cleanup.
- Baseline counts are labeled pre-merge historical evidence; final evidence identifies the merged revision and records any remaining failures by coherent scope.
- Validated BUILD is presented for human approval before completion; no qualification release regeneration, installed daemon restart or automated review endpoint is invoked.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/daemon/__tests__/handler-runtime.test.ts: reviewed compatibility snapshots include explained cancellation and qualification additions; constructed maps include spread registrations. | `t1` |
| src/daemon/__tests__/repo-call-audit.test.ts: exact RPC/stream union and callable phase coverage, valid kinds/evidence and repo rules; detect missing/stale rows. | `t1` |
| src/daemon/__tests__/repo-call-table.test.ts: exact disjoint modifying/nonmodifying partition over actual registration and callable phases, with unknown-name negative control. | `t1` |
| src/daemon/threads/__tests__/method-class.test.ts: unique complete method classes and stream flags; missing/stale/duplicate/wrong-transport controls; worker-safe imports and explicit retired-review ownership. | `t1` |
| src/daemon/__tests__/daemon-doc-repo-table.test.ts: exact modifying-method names/repo params and six refusal codes. | `t3` |
| src/daemon/__tests__/repo-gate-dispatch.test.ts: exercise every modifying RPC/stream by exact identity without repo, assert unchanged filesystem, retain successful registered feedback append. | `t2` |
| src/daemon/__tests__/repo-call-gate.test.ts: preserve refusal codes, canonical paths, cross-repo and validated continuation semantics. | `t2` |
| qualificationState: isolated full-runtime unary dispatch rejects an unqualified fixture with its existing error rather than unknown-method; routing/class tests prove ordinary session ownership and no admin-board/shared-state dispatch. | `t1`, `t2` |
| Retired review router precedence and no-work refusal controls from Batch04 remain regression evidence; rerun directly affected router/unavailability files if routing assumptions change. | `t1`, `t2` |
| Run all seven baseline files through Node22 scripts/test-harness/run.mjs --concurrency=1; broaden only to directly affected dispatch/phase regressions. | `t3` |
| Retain TAP/results/cleanup evidence under docs/plans; report whole-file failures honestly, no skip/force-exit suppression. | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/standalone/reconcile-daemon-rpc-registration-audit-coverage-E20261120807fa9e8/S001/LLD.md#2-contract-details`
- **[[c2]]** `prior-artifact` `docs/standalone/reconcile-daemon-rpc-registration-audit-coverage-E20261120807fa9e8/S001/LLD.md#3-error-paths`
- **[[c3]]** `prior-artifact` `docs/standalone/reconcile-daemon-rpc-registration-audit-coverage-E20261120807fa9e8/S001/LLD.md#4-test-strategy`
- **[[c4]]** `prior-artifact` `docs/standalone/reconcile-daemon-rpc-registration-audit-coverage-E20261120807fa9e8/S001/LLD.md#5-migration`
