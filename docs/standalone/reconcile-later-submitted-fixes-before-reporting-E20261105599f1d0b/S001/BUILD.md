<!-- insrc:artifact BUILD-599f1d0bd42e0c37-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-07T04:56:57.771Z  ·  **Updated:** 2026-11-07T05:54:35.209Z

**Commit:** 671f18101

## Summary

T4 final-span response schemas now constrain exact decimal intervals and deletion anchors with bounded logarithmic regexes; path-only, historical/gap ranges and none-scope findings reject. Actual native/controller tests cover historical/unassigned/none-scope findings and mandatory coverage omissions, while genuine final findings remain changes_requested. Both routes use identical effective objects, requirements and complete test inputs.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/LLD-599f1d0bd42e0c37-s1.json` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `.insrc/artifacts/LLD-599f1d0bd42e0c37-s1.log.jsonl` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `.insrc/artifacts/PLAN-599f1d0bd42e0c37-s1.json` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `.insrc/artifacts/PLAN-599f1d0bd42e0c37-s1.log.jsonl` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t1.json` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t10.json` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t2.json` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t3.json` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t4.json` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t5.json` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t6.json` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t7.json` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t8.json` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t9.json` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `.insrc/artifacts/TASKS-599f1d0bd42e0c37-s1.json` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `.insrc/artifacts/TASKS-599f1d0bd42e0c37-s1.log.jsonl` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `docs/standalone/reconcile-later-submitted-fixes-before-reporting-E20261105599f1d0b/S001/PLAN.md` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/admission.test.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/contracts.test.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/coordinator.test.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/derived-completion.test.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/derived-unit.test.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/documents-contract.test.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/final-scope-contracts.test.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/history-fixture.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/history.test.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/ownership.test.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/packet-documents.test.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/policy.test.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/publication-fixture.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/route-documents.test.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/selected-code.test.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/admission.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/contracts.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/final-scope-contracts.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/packet.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/sources.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/projection-intervals.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/daemon/tools/builtins/git/diff.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/projection.test.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/projection.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/__tests__/effective-scope.test.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/assessment.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/policy.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/result-schema.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
- `src/workflow/code-review/task-review/results.ts` — **insrc-build** (2026-11-07T05:54:35.209Z)
