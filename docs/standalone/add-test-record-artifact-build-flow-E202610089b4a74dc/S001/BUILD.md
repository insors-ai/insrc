<!-- insrc:artifact BUILD-9b4a74dcdf47852a-S001 -->

# Build (standalone feature) — Story S001

**Size class:** feature  ·  **Standalone:** yes  ·  **Created:** 2026-10-08T18:05:03.112Z  ·  **Updated:** 2026-10-08T19:35:47.039Z

**Commit:** d27e032a

## Triage rationale

One cohesive story under a single design: the build step's validate phase and check planner, the tool's input shape, a new record with its renderer, and the build record's link to it.

## Summary

All twelve tasks of the plan are built. The gate takes a mapping from a Task's named tests to test cases at the validate turn, runs each mapped test file on its own with the TAP reporter, reads a result per test title, and writes a per-Story test record (TESTS.md beside BUILD.md, linked from the build record). A case that fails, is skipped or is not found fails the tests check; a live or smoke test may carry a result reported by the builder. The record cannot be approved or rejected on any route, and every reader of the artifacts directory leaves it alone. The live check ran on 2026-10-08 after the daemon was updated to be6abc9c: Task t1 of Story s7 of the analyzer epic, whose plan names its tests in prose, passed through the new gate with its mapping, twelve cases pass, and that Story's TESTS.md is now the gate's (commit f1972e70). Found while building: a test file's run inherited the test runner's nesting marker, which made node run nothing and exit 0 (fixed); --test-force-exit sometimes drops trailing tests of a file with many tests while exiting 0 (not fixed here; with a mapping such a test now shows as not found). One check of plan Task t12 cannot be met as written: guide sections are stripped from the steering block stamped into CLAUDE.md, so the new build section is served by the guide tool, where it was verified, and not by CLAUDE.md.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-b9d5c5c40df5a574-s7.json` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `.insrc/artifacts/CR-9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `.insrc/artifacts/TESTS-b9d5c5c40df5a574-s7.json` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `docs/daemon.md` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/BUILD.md` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/TESTS.md` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/tests.map.json` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/CR.md` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/README.md` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/mcp.txt` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/vscode.txt` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/workflow.txt` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/mcp/build-step/__tests__/build-step.test.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/mcp/build-step/__tests__/fixtures/tap-sample.tap` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/mcp/build-step/__tests__/render.test.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/mcp/build-step/__tests__/tap-results.test.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/mcp/build-step/__tests__/test-mapping.test.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/mcp/build-step/__tests__/validation-checks.test.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/mcp/build-step/phases/validate.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/mcp/build-step/render.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/mcp/build-step/tap-results.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/mcp/build-step/test-mapping.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/mcp/build-step/types.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/mcp/build-step/validation-checks.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/prompts/build/implement-task.md` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/prompts/build/validate-task.md` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/workflow/__tests__/artifact-kinds.test.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/workflow/__tests__/migrate-docs-tree.test.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/workflow/delivery/load.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/workflow/migrate-docs-tree.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/workflow/path-scheme.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/workflow/runners/build/__tests__/build-record.test.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/workflow/runners/build/__tests__/completion-record.test.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/workflow/runners/build/__tests__/test-record.test.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/workflow/runners/build/own-files.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/workflow/runners/build/standalone-record.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/workflow/runners/build/test-record.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `src/workflow/storage.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `vscode-plugin/assets/steering-block.md` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `vscode-plugin/src/panels/__tests__/daemon-gateway.test.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
- `vscode-plugin/src/panels/daemon-gateway.ts` — **insrc-build** (2026-10-08T19:35:47.039Z)
