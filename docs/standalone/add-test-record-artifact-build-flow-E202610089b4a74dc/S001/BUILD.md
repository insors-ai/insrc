<!-- insrc:artifact BUILD-9b4a74dcdf47852a-S001 -->

# Build (standalone feature) — Story S001

**Size class:** feature  ·  **Standalone:** yes  ·  **Created:** 2026-10-08T18:05:03.112Z  ·  **Updated:** 2026-10-08T18:05:03.112Z

**Commit:** b20d5c12

## Triage rationale

One cohesive story under a single design: the build step's validate phase and check planner, the tool's input shape, a new record with its renderer, and the build record's link to it.

## Summary

Tasks t1 to t11 of the plan are built; t12 (the live check on the real gate) waits for the stakeholder's push and the daemon's update. The gate now takes a mapping from a Task's named tests to test cases at the validate turn, runs each mapped test file on its own with the TAP reporter, reads a result per test title, and writes a per-Story test record (TESTS.md beside BUILD.md, linked from the build record). A case that fails, is skipped or is not found fails the tests check; a live or smoke test may carry a result reported by the builder. The record cannot be approved or rejected on any route, and every reader of the artifacts directory leaves it alone. Two things found while building: a test file's run inherited the test runner's nesting marker, which made node run nothing and exit 0 (fixed; an existing test of the runner had been passing without running anything); and --test-force-exit sometimes drops trailing tests of a file with many tests while exiting 0 (not fixed here; with a mapping such a test now shows as not found instead of passing silently).

## Tasks validated

- ✗ `S001`

## Changes

- `docs/daemon.md` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/README.md` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/mcp.txt` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/vscode.txt` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/workflow.txt` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/mcp/build-step/__tests__/build-step.test.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/mcp/build-step/__tests__/fixtures/tap-sample.tap` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/mcp/build-step/__tests__/render.test.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/mcp/build-step/__tests__/tap-results.test.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/mcp/build-step/__tests__/test-mapping.test.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/mcp/build-step/__tests__/validation-checks.test.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/mcp/build-step/phases/validate.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/mcp/build-step/render.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/mcp/build-step/tap-results.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/mcp/build-step/test-mapping.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/mcp/build-step/types.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/mcp/build-step/validation-checks.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/prompts/build/implement-task.md` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/prompts/build/validate-task.md` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/workflow/__tests__/artifact-kinds.test.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/workflow/__tests__/migrate-docs-tree.test.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/workflow/delivery/load.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/workflow/migrate-docs-tree.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/workflow/path-scheme.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/workflow/runners/build/__tests__/build-record.test.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/workflow/runners/build/__tests__/completion-record.test.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/workflow/runners/build/__tests__/test-record.test.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/workflow/runners/build/own-files.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/workflow/runners/build/standalone-record.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/workflow/runners/build/test-record.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `src/workflow/storage.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `vscode-plugin/assets/steering-block.md` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `vscode-plugin/src/panels/__tests__/daemon-gateway.test.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
- `vscode-plugin/src/panels/daemon-gateway.ts` — **insrc-build** (2026-10-08T18:05:03.112Z)
