<!-- insrc:artifact BUILD-eedc4519199b24b4-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-09T15:23:29.152Z  ·  **Updated:** 2026-11-09T16:28:26.847Z

**Commit:** 6951de5a0

## Summary

The plugin reads the new snapshot fields, joins plan rows on planRowId, renders tasks in the order given, shows an Epic as complete only from its own unit status, and shows each Task's unit status beside its validation result.

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

- `src/workflow/artifact-core/__tests__/completion-evidence.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/artifact-core/__tests__/completion-holds.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/artifact-core/__tests__/lifecycle-completion.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/artifact-core/__tests__/lifecycle-kit.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/artifact-core/completion-evidence.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/artifact-core/lifecycle.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/tasks/__tests__/task-build-rounds.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/cli/services/workflow.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/daemon/workflow-approve.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/__tests__/story-completion.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/artifact-core/__tests__/lifecycle-resignoff.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/artifact-core/__tests__/lifecycle-table.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/artifact-core/history.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/artifact-core/lifecycle-service.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/artifact-core/types.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/daemon/steps/workflow-step/phases/synthesize.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/__tests__/workflow-head-lifecycle.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/artifact-write-inventory.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/storage.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/daemon/repo-convert.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/artifact-core/repo-lifecycle.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/artifact-core/store.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/convert/__tests__/repair.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/convert/amendments.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/convert/migrated-head.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/convert/plan.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/convert/rename.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/convert/repair.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/convert/stamps.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/convert/types.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/convert/units.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/tracker/binding.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/tasks/task-set.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/convert/__tests__/repair-tasks.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/convert/tasks.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/convert/__tests__/repair-kit.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/convert/__tests__/repair-settle.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/convert/settle.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/delivery/__tests__/handlers.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/delivery/__tests__/load.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/delivery/handlers.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/delivery/load.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/delivery/types.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/delivery/__tests__/fixtures.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/delivery/__tests__/fixtures/delivery-snapshot.sample.json` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/delivery/__tests__/gate.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/delivery/__tests__/graph.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/delivery/__tests__/notice.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/delivery/__tests__/snapshot.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/delivery/__tests__/stage.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/delivery/gate.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/delivery/graph.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/delivery/notice.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/delivery/snapshot.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/delivery/stage.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/daemon/__tests__/delivery-handler-contract.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/delivery/__tests__/task-membership.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `src/workflow/path-scheme.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `vscode-plugin/src/delivery/__tests__/board-details.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `vscode-plugin/src/delivery/__tests__/board-fixtures.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `vscode-plugin/src/delivery/__tests__/board-views.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `vscode-plugin/src/delivery/__tests__/delivery-client.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `vscode-plugin/src/delivery/__tests__/labels.test.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `vscode-plugin/src/delivery/board-details.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `vscode-plugin/src/delivery/board-host.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `vscode-plugin/src/delivery/board-model.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `vscode-plugin/src/delivery/board-protocol.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `vscode-plugin/src/delivery/board-views.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `vscode-plugin/src/delivery/delivery-contract.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
- `vscode-plugin/src/delivery/labels.ts` — **insrc-build** (2026-11-09T16:28:26.847Z)
