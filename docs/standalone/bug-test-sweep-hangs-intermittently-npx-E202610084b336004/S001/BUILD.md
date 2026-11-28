<!-- insrc:artifact BUILD-4b33600426ce4112-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-28T09:32:39.162Z  ·  **Updated:** 2026-11-28T12:37:24.878Z

**Commit:** c510fb07c

## Summary

t3 smoke, like-for-like v2 after review feedback (evidence /tmp/smoke-sweep-comparison2.txt + per-run TAP /tmp/smoke2-{baseline-1,baseline-2,postfix-1,postfix-2}.tap): identical explicit selection (all 439 src/workflow+src/mcp *.test.ts files) both sides, common outer deadline 300s (>120s per-test timeout, >~150s normal completion). BASELINE bare node tsx --test (no --test-timeout): 2/2 rc=124 killed at 300s/301s with NO TAP summary — node emits the summary only after every file child exits, so files never reported. POST-FIX test:sweep command (--test-timeout=120000): 2/2 terminated on their own at 135s/144s with complete TAP summaries (# tests 2714/2720, pass 2629, fail 79, cancelled 3/9); 3 and 9 tests show "test timed out after 120000ms" — stragglers bounded by the per-test timeout and reported as failures. Remaining fails are pre-existing bare-run harness-context refusals, same class as pre-fix. Cancellations distinguished from failures in the per-run TAP.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/__tests__/helpers/exec-stand-in.test.ts` — **insrc-build** (2026-11-28T12:37:24.878Z)
- `src/workflow/__tests__/helpers/exec-stand-in.ts` — **insrc-build** (2026-11-28T12:37:24.878Z)
- `docs/testing.md` — **insrc-build** (2026-11-28T12:37:24.878Z)
- `package.json` — **insrc-build** (2026-11-28T12:37:24.878Z)
- `scripts/__tests__/test-sweep.test.ts` — **insrc-build** (2026-11-28T12:37:24.878Z)
