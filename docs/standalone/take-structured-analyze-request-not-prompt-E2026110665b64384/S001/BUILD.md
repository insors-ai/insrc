<!-- insrc:artifact BUILD-65b643840a294422-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-06T19:48:13.986Z  ·  **Updated:** 2026-11-07T13:02:45.751Z

**Commit:** 366ac7b1c

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✗ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`
- ✓ `t11`
- ✓ `t12`
- ✓ `t13`
- ✓ `t14`
- ✓ `t15`
- ✓ `t16`
- ✓ `t17`
- ✓ `t18`
- ✓ `t19`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/analyze-rpc-intent.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/shared/analyze-types.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/__tests__/request.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/request.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/__tests__/scope-area.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/runtimes/shared/task-scope.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/__tests__/scope-validate.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/invariants.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/types.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/steps/__tests__/analyze-oneshot-handler.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/steps/__tests__/start-request.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/steps/analyze-oneshot.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/steps/analyze-step/phases/narrow.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/steps/analyze-step/phases/plan.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/steps/analyze-step/phases/start.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/steps/analyze-step/scope.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/__tests__/run-shaper-wiring.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/steps/__tests__/analyze-oneshot-request.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/steps/analyze-step/types.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/__tests__/pipeline-outcome.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/__tests__/prepare-scope.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/steps/__tests__/plan-module-scope.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/__tests__/oneshot-module-scope.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/__tests__/resolve-repo-indexed.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/__tests__/freeform-probe-scope.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/__tests__/concept-resolve-scope.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/concept-resolve.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/__tests__/request-end-to-end.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/prompts/analyze/decompose.system.md` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/prompts/analyze/synthesize.code.system.md` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/synthesizer.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/__tests__/capability-reuse-anchor.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/capability-reuse-check.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/__tests__/docs-retrieval.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/__tests__/doc-area-forwarding.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/doc-constraint-enumerate.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/doc-decision-trace.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/doc-mention.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/executor.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/runtimes/docs/__tests__/docs-area-retrieval.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/__tests__/cache-area-isolation.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/__tests__/exploration-cache-scope.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/__tests__/removed-flags.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/exploration-cache-key.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/db/exploration-cache.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/completeness.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/schema.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/__tests__/answer-report-scope.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/answer-report.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/steps/__tests__/analyze-step-answer-prompt-missing.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/steps/__tests__/analyze-step-bundle-report.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/steps/analyze-step/answer-turn.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/steps/analyze-step/phases/bundle.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/steps/__tests__/analyze-step-failed-lookup.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/__tests__/cache-key-scope.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/__tests__/context-prompts.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/decomposer.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/__tests__/daemon-status-features.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/__tests__/status-store-failure.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/status.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/mcp/__tests__/forward-step-features.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/mcp/forward-step.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/mcp/__tests__/analyze-request-forward.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/mcp/__tests__/fixtures/tool-surface.golden.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/mcp/server.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/__tests__/steering-analyze-request.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/__tests__/steering-gated-refresh.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/steering-inject.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/mcp/steering-template.md` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/context/__tests__/lookup-measure.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/analyze/explore/__tests__/doc-relations-attach.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `docs/standalone/take-structured-analyze-request-not-prompt-E2026110665b64384/S001/T19-VERIFICATION.md` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/ISSUE-65b643840a294422.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/ISSUE-65b643840a294422.log.jsonl` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/LLD-65b643840a294422-s1.log.jsonl` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/PLAN-65b643840a294422-s1.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/PLAN-65b643840a294422-s1.log.jsonl` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t1.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t10.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t11.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t12.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t13.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t14.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t15.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t16.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t17.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t18.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t19.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t2.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t3.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t4.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t5.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t6.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t7.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t8.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASK-65b643840a294422-s1-t9.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASKS-65b643840a294422-s1.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/TASKS-65b643840a294422-s1.log.jsonl` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `docs/standalone/take-structured-analyze-request-not-prompt-E2026110665b64384/ISSUE.md` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `docs/standalone/take-structured-analyze-request-not-prompt-E2026110665b64384/S001/PLAN.md` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/CR-65b643840a294422-s1.json` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `.insrc/artifacts/CR-65b643840a294422-s1.log.jsonl` — **insrc-build** (2026-11-07T13:02:45.751Z)
- `docs/standalone/take-structured-analyze-request-not-prompt-E2026110665b64384/S001/CR.md` — **insrc-build** (2026-11-07T13:02:45.751Z)
