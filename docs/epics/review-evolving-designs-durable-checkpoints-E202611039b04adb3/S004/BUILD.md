<!-- insrc:artifact BUILD-9b04adb36cac716d-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-11-07T19:47:05.310Z  ·  **Updated:** 2026-11-08T05:23:36.631Z

**Commit:** 870fa0c4b

## Summary

Added actual coordinator recovery/native dispatch at a measured exactly-64MiB admission with maximum-size feedback, real checkpoint persistence/consolidation and reload. The same initial durable fixture plus one historical byte rejects through coordinator recovery, persists checkpoint_capacity, invokes no provider and preserves zero new unit/action charges; a fresh coordinator observes failed. Current mutable observer/dispatch metadata is reserved at encoded upper bounds rather than double-counted at changing instantaneous sizes. All 98 design-review tests and TypeScript pass.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/LLD-9b04adb36cac716d-s4.json` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `.insrc/artifacts/LLD-9b04adb36cac716d-s4.log.jsonl` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `.insrc/artifacts/PLAN-9b04adb36cac716d-s4.json` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `.insrc/artifacts/PLAN-9b04adb36cac716d-s4.log.jsonl` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `.insrc/artifacts/TASK-9b04adb36cac716d-s4-t1.json` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `.insrc/artifacts/TASK-9b04adb36cac716d-s4-t2.json` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `.insrc/artifacts/TASK-9b04adb36cac716d-s4-t3.json` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `.insrc/artifacts/TASK-9b04adb36cac716d-s4-t4.json` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `.insrc/artifacts/TASK-9b04adb36cac716d-s4-t5.json` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `.insrc/artifacts/TASK-9b04adb36cac716d-s4-t6.json` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `.insrc/artifacts/TASK-9b04adb36cac716d-s4-t7.json` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `.insrc/artifacts/TASK-9b04adb36cac716d-s4-t8.json` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `.insrc/artifacts/TASK-9b04adb36cac716d-s4-t9.json` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `.insrc/artifacts/TASKS-9b04adb36cac716d-s4.json` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `.insrc/artifacts/TASKS-9b04adb36cac716d-s4.log.jsonl` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S004/LLD.md` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S004/PLAN.md` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S004/sequence-diagram.html` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `src/workflow/review/design-review/__tests__/history-aggregate.test.ts` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `src/workflow/review/design-review/__tests__/impact-contracts.test.ts` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `src/workflow/review/design-review/checkpoint.ts` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `src/workflow/review/design-review/contracts.ts` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `src/workflow/review/design-review/history.ts` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `src/workflow/review/design-review/provenance.ts` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `src/workflow/review/design-review/results.ts` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `src/workflow/review/design-review/__tests__/capacity.test.ts` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `src/workflow/review/design-review/capacity.ts` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `src/workflow/review/design-review/coordinator.ts` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `src/workflow/artifact-core/__tests__/design-history-storage.test.ts` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `src/workflow/artifact-core/journal.ts` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `src/workflow/artifact-core/sidecar-store.ts` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `src/workflow/artifact-core/sidecar.ts` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `src/workflow/artifact-core/store.ts` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `src/workflow/artifact-core/history.ts` — **insrc-build** (2026-11-08T05:23:36.631Z)
- `src/workflow/artifact-core/types.ts` — **insrc-build** (2026-11-08T05:23:36.631Z)
