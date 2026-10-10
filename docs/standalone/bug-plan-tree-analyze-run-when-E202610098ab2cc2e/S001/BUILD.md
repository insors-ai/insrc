<!-- insrc:artifact BUILD-8ab2cc2edb3743df-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-10T12:08:41.130Z  ·  **Updated:** 2026-10-10T12:31:30.435Z

**Commit:** 09d9bcbb

## Summary

docs/daemon.md (a new part of the section on the final report being written from the inputs that exist) and design/analyze-framework.md now say what a consumer and the report task receive: every output under a name, each with its task; a failed producer named as absent beside its siblings; and that the report prompt grows with the number of producers, which Story s3 of the analyzer Epic is to bound. The whole analyze suite was run at bc072f79 (before the Story) and at f50af845 (this task) and compared by test name: 1148 and 1157 tests, no failure in either, no result changed, no name gone, nine names new. The comparison and both raw outputs are in the Story's measurements folder.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/CR-8ab2cc2edb3743df-S001.json` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `design/analyze-framework.md` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `docs/daemon.md` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `docs/standalone/bug-plan-tree-analyze-run-when-E202610098ab2cc2e/S001/CR.md` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `docs/standalone/bug-plan-tree-analyze-run-when-E202610098ab2cc2e/S001/measurements/analyze-suite-after-f50af845.tap` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `docs/standalone/bug-plan-tree-analyze-run-when-E202610098ab2cc2e/S001/measurements/analyze-suite-before-bc072f79.tap` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `docs/standalone/bug-plan-tree-analyze-run-when-E202610098ab2cc2e/S001/measurements/analyze-suite-comparison-t3.md` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/analyze/executor/__tests__/walker-aggregate.test.ts` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/analyze/executor/__tests__/walker-walk-failure.test.ts` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/analyze/executor/__tests__/walker.test.ts` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/analyze/executor/types.ts` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/analyze/executor/walker.ts` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/analyze/runtimes/__tests__/aggregate-absent-inputs.test.ts` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/analyze/runtimes/code/__tests__/aggregate-report.live.test.ts` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/analyze/runtimes/data/__tests__/aggregate-report.live.test.ts` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/analyze/runtimes/generic/__tests__/aggregate-report.live.test.ts` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/analyze/runtimes/infra/__tests__/aggregate-report.live.test.ts` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/analyze/runtimes/shared/__tests__/adherence-constraints.test.ts` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/analyze/runtimes/shared/__tests__/aggregate-message-before-8ab2cc2e.json` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/analyze/runtimes/shared/__tests__/aggregator.test.ts` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/analyze/runtimes/shared/aggregator.ts` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/prompts/analyze/code.aggregate.system.md` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/prompts/analyze/data.aggregate.system.md` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/prompts/analyze/docs.aggregate.system.md` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/prompts/analyze/generic.aggregate.system.md` — **insrc-build** (2026-10-10T12:31:30.435Z)
- `src/prompts/analyze/infra.aggregate.system.md` — **insrc-build** (2026-10-10T12:31:30.435Z)
