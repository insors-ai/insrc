<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s7 -->

# Build (plan-driven) — Story s7

**Standalone:** no  ·  **Created:** 2026-10-08T14:37:06.508Z  ·  **Updated:** 2026-10-09T05:22:18.063Z

**Commit:** 4093c5fa

## Summary

Added resolveTaskScope in src/analyze/runtimes/shared/task-scope.ts: it resolves a plan task's scope for its family through resolveScopeForTarget, against the family's row of TARGET_TO_KINDS, and runs the indexed check for the code and docs families with the same readers. A refusal names the template. No task calls it yet. resolveScopeForTarget takes the table as an optional last parameter so that a test can show no other list is consulted. The catch-clause inventory of the runtime files gained the new file's one rethrow.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `.insrc/artifacts/CR-9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `.insrc/artifacts/LLD-9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `.insrc/artifacts/PLAN-9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `.insrc/artifacts/TESTS-9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `.insrc/build-start/9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `docs/daemon.md` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/README.md` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/analyze.txt` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/daemon.txt` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/mcp.txt` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/workflow.txt` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/BUILD.md` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/CR.md` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/LLD.md` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/PLAN.md` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/TESTS.md` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/README.md` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/mcp.txt` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/vscode.txt` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/workflow.txt` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/tap-sample/sample-source.txt` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/tap-sample/sample.tap` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/analyze/context/__tests__/invariants.test.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/analyze/context/__tests__/prepare-scope.test.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/analyze/context/invariants.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/analyze/runtimes/shared/__tests__/task-scope.test.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/analyze/runtimes/shared/task-scope.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/mcp/analyze-step/scope.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/mcp/build-step/__tests__/build-step.test.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/mcp/build-step/__tests__/fixtures/tap-sample.tap` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/mcp/build-step/__tests__/render.test.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/mcp/build-step/__tests__/tap-results.test.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/mcp/build-step/__tests__/test-mapping.test.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/mcp/build-step/__tests__/validation-checks.test.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/mcp/build-step/phases/validate.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/mcp/build-step/render.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/mcp/build-step/tap-results.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/mcp/build-step/test-mapping.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/mcp/build-step/types.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/mcp/build-step/validation-checks.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/prompts/build/implement-task.md` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/prompts/build/validate-task.md` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/workflow/__tests__/artifact-kinds.test.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/workflow/__tests__/migrate-docs-tree.test.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/workflow/delivery/load.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/workflow/migrate-docs-tree.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/workflow/path-scheme.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/workflow/runners/build/__tests__/build-record.test.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/workflow/runners/build/__tests__/completion-record.test.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/workflow/runners/build/__tests__/test-record.test.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/workflow/runners/build/own-files.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/workflow/runners/build/standalone-record.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/workflow/runners/build/test-record.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `src/workflow/storage.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `vscode-plugin/assets/steering-block.md` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `vscode-plugin/src/panels/__tests__/daemon-gateway.test.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
- `vscode-plugin/src/panels/daemon-gateway.ts` — **insrc-build** (2026-10-09T05:22:18.063Z)
