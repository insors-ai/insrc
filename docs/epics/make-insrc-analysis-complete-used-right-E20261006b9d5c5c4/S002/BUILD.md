<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-09T16:31:36.297Z  ·  **Updated:** 2026-10-09T20:18:49.950Z

**Commit:** 646bda33

## Summary

Task t9 adds the section "How a request's size is measured" to docs/daemon.md (the table, what is counted for each kind of source and scope, the hint, the not-determined case, the measure in the report and its line, a note for clients), corrects design/analyze-framework.md where it said the classifier produces the size, notes on the old docs-module plan that the scope picker is gone, and describes the two tools' size input as a hint. The five suites were compared by test name with the Story's baseline: no test that passed before fails after; four names are gone, each named with what became of it (S002/measurements/baseline-comparison-t9.md). Origin was merged with --no-ff (67b5ca52), pushed, and the installed daemon updated and restarted, each on the stakeholder's word. The live check then ran two requests through the daemon, one at a time: the same code request measured S on the directory src/analyze/classifier (9 files, 44 entities) and XL on the whole repository (4,584 files, 41,943 entities), each with the stated M as the hint and the measure line in the answer, and no size-picking call (S002/measurements/live-run-t9.md). The repository run also showed a defect that is not this Story's: a child plan's task outputs share files with its parent's, so three of four child plans gave no report; it is recorded and not yet filed.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✗ `t9`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-b9d5c5c40df5a574-s2.json` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `design/analyze-framework.md` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/daemon.md` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/README.md` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/analyze.txt` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/config.txt` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/daemon.txt` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/mcp.txt` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/baseline/vscode-plugin.txt` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/after/analyze.txt` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/after/config.txt` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/after/daemon.txt` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/after/mcp.txt` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/after/vscode-plugin.txt` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/baseline-comparison-t9.md` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live-run-t9.md` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/directory.frames.jsonl` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/directory.meta.json` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/directory.result.json` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/directory.run/plan.json` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/directory.run/run.json` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/repo.frames.jsonl` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/repo.meta.json` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/repo.result.json` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/repo.run/children/t18.plan.json` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/repo.run/children/t18.record.json` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/repo.run/children/t19.plan.json` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/repo.run/children/t19.record.json` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/repo.run/children/t20.plan.json` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/repo.run/children/t20.record.json` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/repo.run/children/t21.plan.json` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/repo.run/children/t21.record.json` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/repo.run/plan.json` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/repo.run/run.json` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/run.mjs` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `docs/plans/docs-module.md` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/__tests__/measure-pass.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/__tests__/measure.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/__tests__/model-schemas-draft-2020.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/__tests__/report-head.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/classifier/__tests__/no-size.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/classifier/__tests__/schema.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/classifier/driver.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/classifier/index.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/classifier/schema.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/classifier/scope-picker.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/classifier/validate.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/completeness.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/context/__tests__/lookup-measure.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/context/__tests__/model-failure-callers.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/context/__tests__/pipeline-outcome.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/context/__tests__/run-shaper-wiring.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/context/__tests__/shaper-provider.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/context/boot-validator.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/context/types.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/explore/answer-report.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/explore/executor.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/explore/freeform-probe.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/measure.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/orchestrator/__tests__/hinted-branch.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/orchestrator/__tests__/live-runs.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/orchestrator/__tests__/run-measure.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/planner/__tests__/recursive.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/planner/driver.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/planner/recursive.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/runtimes/data/_shared.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/runtimes/infra/__tests__/walk-files.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/analyze/runtimes/infra/_shared.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/config/__tests__/retired-roles.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/config/__tests__/role-taxonomy.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/config/reconcile.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/config/role-taxonomy.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/daemon/__tests__/analyze-run-empty-prompt.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/daemon/db/__tests__/list-complete.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/daemon/db/drivers/cassandra.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/daemon/db/drivers/clickhouse.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/daemon/db/drivers/dynamodb.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/daemon/db/drivers/etcd.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/daemon/db/drivers/mongodb.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/daemon/db/drivers/mssql.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/daemon/db/drivers/mysql.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/daemon/db/drivers/nats.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/daemon/db/drivers/oracle.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/daemon/db/drivers/pg.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/daemon/db/drivers/redis.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/daemon/db/drivers/sqlite.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/daemon/db/list-files.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/mcp/__tests__/analyze-step-answer-prompt-missing.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/mcp/__tests__/analyze-step-bundle-report.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/mcp/__tests__/analyze-step-measure.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/mcp/analyze-step/answer-turn.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/mcp/analyze-step/phases/bundle.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/mcp/analyze-step/phases/narrow.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/mcp/analyze-step/phases/plan.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/mcp/analyze-step/phases/start.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/mcp/analyze-step/scope.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/mcp/analyze-step/state.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/mcp/bundle-md.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/prompts/analyze/classify.system.md` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/prompts/analyze/docs.system.md` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/prompts/analyze/scope-picker.system.md` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `src/shared/db-driver.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-09T20:18:49.950Z)
- `vscode-plugin/src/config/__tests__/per-role.test.ts` — **insrc-build** (2026-10-09T20:18:49.950Z)
