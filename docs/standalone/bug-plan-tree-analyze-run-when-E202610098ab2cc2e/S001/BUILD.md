<!-- insrc:artifact BUILD-8ab2cc2edb3743df-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-10T12:08:41.130Z  ·  **Updated:** 2026-10-10T12:11:05.590Z

**Commit:** b79348f8

## Summary

The five aggregate prompts now describe the block as the code renders it: one section per output name, and for a name several tasks produced a counted heading with one sub-section per task carrying its params line; the report must cover every sub-section. Only that bullet changed in each file (the diff of the five files is that bullet alone). A test renders the headings with the code and checks each prompt holds them, so the prompts and the renderer cannot drift apart silently; reverting one prompt and changing the renderer's heading each fail it.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/analyze/executor/__tests__/walker-aggregate.test.ts` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/analyze/executor/__tests__/walker-walk-failure.test.ts` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/analyze/executor/__tests__/walker.test.ts` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/analyze/executor/types.ts` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/analyze/executor/walker.ts` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/analyze/runtimes/__tests__/aggregate-absent-inputs.test.ts` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/analyze/runtimes/code/__tests__/aggregate-report.live.test.ts` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/analyze/runtimes/data/__tests__/aggregate-report.live.test.ts` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/analyze/runtimes/generic/__tests__/aggregate-report.live.test.ts` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/analyze/runtimes/infra/__tests__/aggregate-report.live.test.ts` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/analyze/runtimes/shared/__tests__/adherence-constraints.test.ts` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/analyze/runtimes/shared/__tests__/aggregate-message-before-8ab2cc2e.json` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/analyze/runtimes/shared/__tests__/aggregator.test.ts` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/analyze/runtimes/shared/aggregator.ts` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/prompts/analyze/code.aggregate.system.md` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/prompts/analyze/data.aggregate.system.md` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/prompts/analyze/docs.aggregate.system.md` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/prompts/analyze/generic.aggregate.system.md` — **insrc-build** (2026-10-10T12:11:05.590Z)
- `src/prompts/analyze/infra.aggregate.system.md` — **insrc-build** (2026-10-10T12:11:05.590Z)
