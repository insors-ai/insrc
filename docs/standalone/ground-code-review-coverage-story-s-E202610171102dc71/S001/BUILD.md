<!-- insrc:artifact BUILD-1102dc7125ad0c07-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-17T06:56:06.405Z  ·  **Updated:** 2026-10-17T07:02:30.802Z

**Commit:** 2142a074

## Summary

2142a074: new src/workflow/code-review/dimensions/test-record-view.ts builds the per-file view (latest run by ranAt chosen before the entry is checked; malformed latest entry is an unverified barrier; timed-out/non-zero/title-less handled; older-only titles listed as notInLatestRun; BUILD per-task passed or 'unavailable'; notes for entries without a file name and tasks without files). coverage.ts renders it as a trailing JSON section before ## Output and states the pass/unverified rule; with no TESTS record the every-test-unverified text stays. Eight falsifying mutations (storage order, tie, barrier, timeout reason, notInLatestRun, BUILD passed, section not rendered, notes) each fail the named test. tsc clean; workflow/daemon-steps/MCP suites 2298 pass, only the pre-existing review-decision failure.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/code-review/__tests__/subject.test.ts` — **insrc-build** (2026-10-17T07:02:30.802Z)
- `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` — **insrc-build** (2026-10-17T07:02:30.802Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-17T07:02:30.802Z)
- `src/workflow/code-review/dimensions/test-record-view.ts` — **insrc-build** (2026-10-17T07:02:30.802Z)
- `src/workflow/code-review/subject.ts` — **insrc-build** (2026-10-17T07:02:30.802Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-17T07:02:30.802Z)
