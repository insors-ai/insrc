<!-- insrc:artifact BUILD-599f1d0bd42e0c37-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-07T04:56:57.771Z  ·  **Updated:** 2026-11-07T06:30:25.152Z

**Commit:** 03943cf59

## Summary

T6 now uses precise device/inode proof to classify rejected rename acknowledgements: unchanged prior => not_replaced, owned temporary now visible => replaced, unprovable => uncertain. Coordinator-owned prior/candidate fences survive discarded execution objects and subsequent connections, rejecting structurally valid third states and bad hashes/sources until exact restoration. Accepted-on-disk recovery re-acks the identical mapping. Distinct pending branch follows the approved LLD verbatim: 'Recovery after a pre-replacement failure can retry attribution only if no accepted mapping is actually on disk.' The new both-route test proves explicit re-attribution is allowed ONLY for that pending branch; it is not loss of an accepted mapping. All 166 scoped tests and typecheck pass.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/LLD-599f1d0bd42e0c37-s1.json` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `.insrc/artifacts/LLD-599f1d0bd42e0c37-s1.log.jsonl` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `.insrc/artifacts/PLAN-599f1d0bd42e0c37-s1.json` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `.insrc/artifacts/PLAN-599f1d0bd42e0c37-s1.log.jsonl` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t1.json` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t10.json` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t2.json` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t3.json` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t4.json` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t5.json` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t6.json` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t7.json` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t8.json` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t9.json` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `.insrc/artifacts/TASKS-599f1d0bd42e0c37-s1.json` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `.insrc/artifacts/TASKS-599f1d0bd42e0c37-s1.log.jsonl` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `docs/standalone/reconcile-later-submitted-fixes-before-reporting-E20261105599f1d0b/S001/PLAN.md` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/admission.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/contracts.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/coordinator.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/derived-completion.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/derived-unit.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/documents-contract.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/final-scope-contracts.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/history-fixture.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/history.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/ownership.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/packet-documents.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/policy.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/publication-fixture.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/route-documents.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/selected-code.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/admission.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/contracts.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/final-scope-contracts.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/packet.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/sources.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/projection-intervals.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/daemon/tools/builtins/git/diff.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/projection.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/projection.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/effective-scope.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/assessment.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/policy.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/result-schema.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/results.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/compatibility.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/recovery.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/attribution-binding.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/checkpoint.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/controller.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/coordinator.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/attribution-scope.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
- `src/workflow/code-review/task-review/execution.ts` — **insrc-build** (2026-11-07T06:30:25.152Z)
