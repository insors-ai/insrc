<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-09T16:31:36.297Z  ·  **Updated:** 2026-10-09T18:12:25.659Z

**Commit:** 990a5fce

## Summary

Task t8 removes the size from the classifier (schema, prompt, the required-fields sentence of its user message, the structured call's type, the log line, the return type), makes the validator take an unsized intent, and drops the placeholder size the plan tree's driver gave it. The scope picker is removed with everything that names it: its module and prompt, its three error classes, its exports, its boot-validator entry, its role row, and the cases of the two tests that imported its classes. The VS Code extension no longer declares insrc.models.tasks.analyze.scope.pick and its version is raised to 0.5.13 in its manifest; the extension was not packaged or published. The catalog gains RETIRED_ROLE_IDS and the reconcile prunes each id from models.tasks and from every models.byRepo.<repo>.tasks, reports it as pruned, and throws when a retired id is still in the taxonomy. One change beyond the Task's list: the daemon's intent parser now takes the size as required or optional per request, so the placeholder size I had written for a run-level request in t6 is gone. Test names that no longer exist: two tests were renamed (their titles named the scope picker), and two classifier schema tests about the size were replaced by one that an answer carrying a size is rejected. 21 mutations were run; one survived the first run (a task-level request accepting no size) and was closed with an assertion; all are killed. The analyze, daemon, mcp, config and VS Code extension suites match the Story baseline by test name apart from those renames.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-b9d5c5c40df5a574-s2.json` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/README.md` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/analyze.txt` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/config.txt` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/daemon.txt` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/mcp.txt` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/vscode-plugin.txt` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/__tests__/measure-pass.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/__tests__/measure.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/__tests__/model-schemas-draft-2020.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/__tests__/report-head.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/classifier/__tests__/no-size.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/classifier/__tests__/schema.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/classifier/driver.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/classifier/index.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/classifier/schema.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/classifier/scope-picker.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/classifier/validate.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/completeness.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/context/__tests__/lookup-measure.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/context/__tests__/model-failure-callers.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/context/__tests__/pipeline-outcome.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/context/__tests__/run-shaper-wiring.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/context/__tests__/shaper-provider.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/context/boot-validator.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/context/types.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/explore/answer-report.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/explore/executor.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/explore/freeform-probe.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/measure.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/orchestrator/__tests__/hinted-branch.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/orchestrator/__tests__/live-runs.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/orchestrator/__tests__/run-measure.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/planner/__tests__/recursive.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/planner/driver.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/planner/recursive.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/runtimes/data/_shared.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/runtimes/infra/__tests__/walk-files.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/analyze/runtimes/infra/_shared.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/config/__tests__/retired-roles.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/config/__tests__/role-taxonomy.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/config/reconcile.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/config/role-taxonomy.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/daemon/__tests__/analyze-run-empty-prompt.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/daemon/db/__tests__/list-complete.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/daemon/db/drivers/cassandra.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/daemon/db/drivers/clickhouse.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/daemon/db/drivers/dynamodb.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/daemon/db/drivers/etcd.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/daemon/db/drivers/mongodb.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/daemon/db/drivers/mssql.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/daemon/db/drivers/mysql.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/daemon/db/drivers/nats.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/daemon/db/drivers/oracle.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/daemon/db/drivers/pg.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/daemon/db/drivers/redis.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/daemon/db/drivers/sqlite.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/daemon/db/list-files.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/mcp/__tests__/analyze-step-answer-prompt-missing.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/mcp/__tests__/analyze-step-bundle-report.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/mcp/__tests__/analyze-step-measure.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/mcp/analyze-step/answer-turn.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/mcp/analyze-step/phases/bundle.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/mcp/analyze-step/phases/narrow.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/mcp/analyze-step/phases/plan.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/mcp/analyze-step/phases/start.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/mcp/analyze-step/scope.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/mcp/analyze-step/state.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/mcp/bundle-md.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/prompts/analyze/classify.system.md` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/prompts/analyze/scope-picker.system.md` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `src/shared/db-driver.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-09T18:12:25.659Z)
- `vscode-plugin/src/config/__tests__/per-role.test.ts` — **insrc-build** (2026-10-09T18:12:25.659Z)
