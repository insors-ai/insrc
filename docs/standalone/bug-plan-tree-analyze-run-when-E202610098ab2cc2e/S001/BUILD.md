<!-- insrc:artifact BUILD-8ab2cc2edb3743df-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-10T12:08:41.130Z  ·  **Updated:** 2026-10-10T12:08:41.130Z

**Commit:** ff6107ec

## Summary

The plan walk now keeps, per output name, the list of outputs of the tasks that finished ok (task id, template, params, value) and hands a consumer the whole list; a later producer no longer replaces an earlier one. The report prompt keeps its block for a name with one output (byte-identical to before, checked against a message kept from the commit before the change) and renders one sub-section per task for a name with several. A failed or skipped producer is listed as absent also when a sibling produced the name, and is worded by its task. The ten test files that build or read the map, and two adherence tests that hand the check a map, are on the new shape; eight falsifying mutations were each caught.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/analyze/executor/__tests__/walker-aggregate.test.ts` — **insrc-build** (2026-10-10T12:08:41.130Z)
- `src/analyze/executor/__tests__/walker-walk-failure.test.ts` — **insrc-build** (2026-10-10T12:08:41.130Z)
- `src/analyze/executor/__tests__/walker.test.ts` — **insrc-build** (2026-10-10T12:08:41.130Z)
- `src/analyze/executor/types.ts` — **insrc-build** (2026-10-10T12:08:41.130Z)
- `src/analyze/executor/walker.ts` — **insrc-build** (2026-10-10T12:08:41.130Z)
- `src/analyze/runtimes/__tests__/aggregate-absent-inputs.test.ts` — **insrc-build** (2026-10-10T12:08:41.130Z)
- `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` — **insrc-build** (2026-10-10T12:08:41.130Z)
- `src/analyze/runtimes/code/__tests__/aggregate-report.live.test.ts` — **insrc-build** (2026-10-10T12:08:41.130Z)
- `src/analyze/runtimes/data/__tests__/aggregate-report.live.test.ts` — **insrc-build** (2026-10-10T12:08:41.130Z)
- `src/analyze/runtimes/generic/__tests__/aggregate-report.live.test.ts` — **insrc-build** (2026-10-10T12:08:41.130Z)
- `src/analyze/runtimes/infra/__tests__/aggregate-report.live.test.ts` — **insrc-build** (2026-10-10T12:08:41.130Z)
- `src/analyze/runtimes/shared/__tests__/adherence-constraints.test.ts` — **insrc-build** (2026-10-10T12:08:41.130Z)
- `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` — **insrc-build** (2026-10-10T12:08:41.130Z)
- `src/analyze/runtimes/shared/__tests__/aggregate-message-before-8ab2cc2e.json` — **insrc-build** (2026-10-10T12:08:41.130Z)
- `src/analyze/runtimes/shared/__tests__/aggregator.test.ts` — **insrc-build** (2026-10-10T12:08:41.130Z)
- `src/analyze/runtimes/shared/aggregator.ts` — **insrc-build** (2026-10-10T12:08:41.130Z)
