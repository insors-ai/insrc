<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s8 -->

# Build (plan-driven) — Story s8

**Standalone:** no  ·  **Created:** 2026-10-09T13:06:19.852Z  ·  **Updated:** 2026-10-09T13:08:04.779Z

**Commit:** 75899025

## Summary

The baseline of the analyze suite (1077 tests, 982 pass, 0 fail, 92 skipped) and of the gated file deterministic-runtimes.test.ts (11 pass) was recorded at 31a381e6 on a clean tree and committed on its own before the first source change. Then one new file, src/analyze/runtimes/shared/source-modules.ts: sourceModulesOf (the modules of a scope's area), moduleOfEntityId (a value looked up as an entity id, with no scope) and moduleOfDirectory (a directory path under a resolved scope). Nothing calls them yet. The gate's first verdict refused the task because the id reader's message for an entity of another kind had lost its '(taskId=…)'; the function now takes the task's id as a third argument and the message is word for word the one before this Story (75899025). That third argument is a departure from the design's two-argument signature, made so that the design's own 'today's message' holds. Sixteen mutations were each caught by the five unit tests.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/baseline/README.md` — **insrc-build** (2026-10-09T13:08:04.779Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/baseline/analyze.txt` — **insrc-build** (2026-10-09T13:08:04.779Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/baseline/deterministic-runtimes.gated.txt` — **insrc-build** (2026-10-09T13:08:04.779Z)
- `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` — **insrc-build** (2026-10-09T13:08:04.779Z)
- `src/analyze/runtimes/shared/source-modules.ts` — **insrc-build** (2026-10-09T13:08:04.779Z)
