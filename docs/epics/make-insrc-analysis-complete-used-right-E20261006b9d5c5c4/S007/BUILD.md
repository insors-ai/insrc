<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s7 -->

# Build (plan-driven) — Story s7

**Standalone:** no  ·  **Created:** 2026-10-08T14:37:06.508Z  ·  **Updated:** 2026-10-09T09:00:08.514Z

**Commit:** 9d819dab

## Summary

When the plan walk cannot write a task's record, the task is recorded as failed with the error's message (task-record-unwritable), its outputs are not handed on, and the walk goes on. The failure is written when it can be and is in the plan's result either way; a task that had already failed or been skipped keeps its own reason. Reporting progress was already guarded against a throwing subscriber. An error not tied to a task (a plan or child plan that cannot be read) still propagates. The test makes the real writer fail by putting a directory where the record's file goes. Six mutations were each caught.

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
- ✓ `t11`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `.insrc/artifacts/CR-9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `.insrc/artifacts/LLD-9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `.insrc/artifacts/PLAN-9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `.insrc/artifacts/TESTS-9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `.insrc/build-start/9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `docs/daemon.md` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/README.md` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/analyze.txt` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/daemon.txt` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/mcp.txt` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/workflow.txt` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/measurements/vector-id-list.md` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/BUILD.md` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/CR.md` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/LLD.md` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/PLAN.md` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/TESTS.md` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/README.md` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/mcp.txt` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/vscode.txt` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/workflow.txt` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/tap-sample/sample-source.txt` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/tap-sample/sample.tap` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/context/__tests__/invariants.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/context/__tests__/prepare-scope.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/context/invariants.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/docs-retrieval.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/executor/__tests__/walker-aggregate.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/executor/__tests__/walker-walk-failure.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/executor/__tests__/walker.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/executor/types.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/executor/walker.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/explore/doc-constraint-enumerate.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/explore/doc-decision-trace.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/orchestrator/__tests__/run-report.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/__tests__/aggregate-absent-inputs.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/__tests__/scope-sources.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/code/__tests__/discovery-modules.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/code/__tests__/scope-area.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/code/_shared.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/code/aggregate-report.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/code/discovery-entrypoints.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/code/discovery-modules.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/code/structure-module-tree.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/data/__tests__/data-runtimes.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/data/_shared.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/data/aggregate-report.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/data/discovery-connections.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/data/discovery-objects.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/data/schema-table.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/docs/__tests__/docs-area-retrieval.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/docs/__tests__/docs-area-vector.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/docs/__tests__/docs-scope.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/docs/aggregate-report.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/docs/constraint-enumerate.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/docs/decision-trace.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/docs/discovery-inventory.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/docs/family-summarise.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/generic/aggregate-report.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/infra/_shared.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/infra/aggregate-report.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/infra/discovery-families.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/infra/inventory-ci.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/infra/inventory-docker.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/infra/inventory-helm.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/infra/inventory-kubernetes.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/infra/inventory-terraform.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/shared/__tests__/aggregator.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/shared/__tests__/task-scope.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/shared/adherence.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/shared/aggregator.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/analyze/runtimes/shared/task-scope.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/db/lance/__tests__/entity-vec.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/db/lance/entity-vec.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/mcp/analyze-step/scope.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/mcp/build-step/__tests__/build-step.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/mcp/build-step/__tests__/fixtures/tap-sample.tap` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/mcp/build-step/__tests__/render.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/mcp/build-step/__tests__/tap-results.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/mcp/build-step/__tests__/test-mapping.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/mcp/build-step/__tests__/validation-checks.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/mcp/build-step/phases/validate.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/mcp/build-step/render.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/mcp/build-step/tap-results.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/mcp/build-step/test-mapping.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/mcp/build-step/types.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/mcp/build-step/validation-checks.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/prompts/build/implement-task.md` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/prompts/build/validate-task.md` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/workflow/__tests__/artifact-kinds.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/workflow/__tests__/migrate-docs-tree.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/workflow/delivery/load.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/workflow/migrate-docs-tree.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/workflow/path-scheme.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/workflow/runners/build/__tests__/build-record.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/workflow/runners/build/__tests__/completion-record.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/workflow/runners/build/__tests__/test-record.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/workflow/runners/build/own-files.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/workflow/runners/build/standalone-record.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/workflow/runners/build/test-record.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `src/workflow/storage.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `vscode-plugin/assets/steering-block.md` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `vscode-plugin/src/panels/__tests__/daemon-gateway.test.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
- `vscode-plugin/src/panels/daemon-gateway.ts` — **insrc-build** (2026-10-09T09:00:08.514Z)
