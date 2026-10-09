<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s7 -->

# Build (plan-driven) — Story s7

**Standalone:** no  ·  **Created:** 2026-10-08T14:37:06.508Z  ·  **Updated:** 2026-10-09T05:51:37.184Z

**Commit:** 1603be22

## Summary

The six infra runtimes resolve their scope with resolveTaskScope and walk the directory it gives; a kind outside the infra row is the typed mismatch error. The three data runtimes resolve the intent's scope through one helper, resolveDataScope: the pool is opened at the scope's own path for a repo, a manifest directory and a workspace, as before, and at the declaring repo for a connection scope, under which the listing holds that connection only and a task that names another connection is refused. The connection-listing task's scopeRefValue parameter still takes precedence. The infra copy of resolveRepoPath and resolveRepoPathFromIntent are removed with their five tests, which are replaced by tests that run the runtimes; a scan over the infra and data runtime sources keeps a direct read of the scope's value from coming back. The analyze suite without force-exit: 964 pass, 0 fail, and the only baseline tests no longer present are those five.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `.insrc/artifacts/CR-9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `.insrc/artifacts/LLD-9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `.insrc/artifacts/PLAN-9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `.insrc/artifacts/TESTS-9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `.insrc/build-start/9b4a74dcdf47852a-S001.json` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `docs/daemon.md` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/README.md` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/analyze.txt` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/daemon.txt` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/mcp.txt` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/workflow.txt` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/BUILD.md` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/CR.md` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/LLD.md` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/PLAN.md` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/TESTS.md` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/README.md` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/mcp.txt` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/vscode.txt` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/baseline/workflow.txt` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/tap-sample/sample-source.txt` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `docs/standalone/add-test-record-artifact-build-flow-E202610089b4a74dc/S001/tap-sample/sample.tap` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/context/__tests__/invariants.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/context/__tests__/prepare-scope.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/context/invariants.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/executor/__tests__/walker.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/executor/types.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/executor/walker.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/orchestrator/__tests__/run-report.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/runtimes/__tests__/scope-sources.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/runtimes/data/__tests__/data-runtimes.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/runtimes/data/_shared.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/runtimes/data/discovery-connections.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/runtimes/data/discovery-objects.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/runtimes/data/schema-table.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/runtimes/infra/_shared.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/runtimes/infra/discovery-families.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/runtimes/infra/inventory-ci.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/runtimes/infra/inventory-docker.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/runtimes/infra/inventory-helm.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/runtimes/infra/inventory-kubernetes.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/runtimes/infra/inventory-terraform.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/runtimes/shared/__tests__/task-scope.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/analyze/runtimes/shared/task-scope.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/mcp/analyze-step/scope.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/mcp/build-step/__tests__/build-step.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/mcp/build-step/__tests__/fixtures/tap-sample.tap` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/mcp/build-step/__tests__/render.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/mcp/build-step/__tests__/tap-results.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/mcp/build-step/__tests__/test-mapping.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/mcp/build-step/__tests__/validation-checks.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/mcp/build-step/phases/validate.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/mcp/build-step/render.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/mcp/build-step/tap-results.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/mcp/build-step/test-mapping.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/mcp/build-step/types.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/mcp/build-step/validation-checks.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/prompts/build/implement-task.md` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/prompts/build/validate-task.md` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/workflow/__tests__/artifact-kinds.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/workflow/__tests__/migrate-docs-tree.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/workflow/delivery/load.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/workflow/migrate-docs-tree.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/workflow/path-scheme.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/workflow/runners/build/__tests__/build-record.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/workflow/runners/build/__tests__/completion-record.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/workflow/runners/build/__tests__/test-record.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/workflow/runners/build/own-files.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/workflow/runners/build/standalone-record.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/workflow/runners/build/test-record.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `src/workflow/storage.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `vscode-plugin/assets/steering-block.md` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `vscode-plugin/src/panels/__tests__/daemon-gateway.test.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
- `vscode-plugin/src/panels/daemon-gateway.ts` — **insrc-build** (2026-10-09T05:51:37.184Z)
