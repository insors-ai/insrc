<!-- insrc:artifact BUILD-2f27754d4ad00b8e-s7 -->

# Build (plan-driven) — Story s7

**Standalone:** no  ·  **Created:** 2026-10-21T17:47:41.683Z  ·  **Updated:** 2026-10-21T18:17:38.087Z

**Commit:** fdc7c9e0

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/plans/core-data-model.md` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/cli/panes/WorkflowsPane.tsx` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/cli/services/workflow.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/daemon/steps/build-step/__tests__/validate-task-round.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/daemon/steps/build-step/phases/validate.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/daemon/tasks-sync.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/__tests__/approve-attach.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/__tests__/draft-issues.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/__tests__/s7-handoffs.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/artifact-core/__tests__/decode.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/artifact-core/__tests__/pass-through-codecs.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/artifact-core/__tests__/store-kit.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/artifact-core/__tests__/store-write.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/artifact-core/__tests__/tasks-codec.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/artifact-core/codecs.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/artifact-core/completion-evidence.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/artifact-core/task-bodies.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/draft-issues.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/runners/tracker/context.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tasks/__tests__/task-build-rounds.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tasks/__tests__/task-diff.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tasks/__tests__/task-edit-check.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tasks/__tests__/task-kit.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tasks/__tests__/task-numbers.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tasks/__tests__/task-readers.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tasks/__tests__/task-set-approve.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tasks/__tests__/task-set-create.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tasks/__tests__/task-set-edit.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tasks/__tests__/task-set-kit.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tasks/__tests__/task-set-reconcile.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tasks/__tests__/task-set-sync.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tasks/__tests__/task-unit-issue.test.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tasks/lookup.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tasks/pure.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tasks/task-set.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tasks/types.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tracker-auto.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tracker/resolve.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
- `src/workflow/tracker/unit-issue.ts` — **insrc-build** (2026-10-21T18:17:38.087Z)
