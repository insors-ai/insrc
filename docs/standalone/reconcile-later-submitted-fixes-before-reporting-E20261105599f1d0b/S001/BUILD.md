<!-- insrc:artifact BUILD-599f1d0bd42e0c37-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-07T04:56:57.771Z  ·  **Updated:** 2026-11-07T08:28:43.788Z

**Commit:** e9117e1ff

## Summary

T8 qualifies complete failed/incomplete checkpoint and canonical CR envelopes before admission and accepted attribution, retaining remaining-task/32KiB diagnostic capacity and checking actual merged canonical bytes under the store queue. USER REQUIREMENT CHANGE in the current turn: 'why 4MB cap? make it configurable'. Implemented review.maxJsonBytes (4MiB default, positive safe integer, live config reads) consistently across all decoders/checkpoints/snapshots/response schemas/CR writes and capacity gates, registered settings catalog, documented operator use. A next attempt that cannot fit retained history refuses until the configured budget is raised; both-route integration tests show raising to8MiB admits it without rewriting old attempts. Production build passed; 28 focused tests passed. Broad config/task-review sweep:344 pass,1 pre-existing unrelated tools.convertEscalate role/settings mismatch (HEAD package.json declares role absent from HEAD taxonomy); neither file changed. No real ~/.insrc/config.json modified; tests isolate HOME under/tmp.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✗ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/LLD-599f1d0bd42e0c37-s1.json` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `.insrc/artifacts/LLD-599f1d0bd42e0c37-s1.log.jsonl` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `.insrc/artifacts/PLAN-599f1d0bd42e0c37-s1.json` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `.insrc/artifacts/PLAN-599f1d0bd42e0c37-s1.log.jsonl` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t1.json` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t10.json` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t2.json` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t3.json` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t4.json` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t5.json` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t6.json` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t7.json` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t8.json` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `.insrc/artifacts/TASK-599f1d0bd42e0c37-s1-t9.json` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `.insrc/artifacts/TASKS-599f1d0bd42e0c37-s1.json` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `.insrc/artifacts/TASKS-599f1d0bd42e0c37-s1.log.jsonl` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `docs/standalone/reconcile-later-submitted-fixes-before-reporting-E20261105599f1d0b/S001/PLAN.md` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/admission.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/contracts.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/coordinator.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/derived-completion.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/derived-unit.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/documents-contract.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/final-scope-contracts.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/history-fixture.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/history.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/ownership.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/packet-documents.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/policy.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/publication-fixture.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/route-documents.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/selected-code.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/admission.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/contracts.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/final-scope-contracts.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/packet.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/sources.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/projection-intervals.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/daemon/tools/builtins/git/diff.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/projection.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/projection.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/effective-scope.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/assessment.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/policy.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/result-schema.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/results.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/compatibility.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/recovery.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/attribution-binding.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/checkpoint.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/controller.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/coordinator.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/attribution-scope.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/execution.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `docs/daemon.md` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/config/__tests__/review.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/config/review-defaults.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/config/review.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/daemon/task-review-rpc.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/artifact-core/store.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/__tests__/capacity.test.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/capacity.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/final-scope-history.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/publication.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
- `src/workflow/code-review/task-review/summary.ts` — **insrc-build** (2026-11-07T08:28:43.788Z)
