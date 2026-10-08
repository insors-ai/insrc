<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-08T07:10:44.483Z  ·  **Updated:** 2026-10-08T07:13:52.438Z

**Commit:** d7de6676

## Summary

Task t2: added src/analyze/item-length.ts (measureItem, partlyReadEntry, the indexer's hash and cut marker as named values) and exported the summariser's cut as SUMMARISER_BODY_CHARS. Four tests pass under Node 22 against entities produced by the real artifact parser; four mutations each make a test fail. Two refinements of the design: an empty stored body is not reported as cut, and the plan's check that no file under src/indexer or src/db changes is asserted as an import check on the module, since a git comparison would pass vacuously once pushed.

## Tasks validated

- ✗ `t1`
- ✗ `t2`

## Changes

- `src/analyze/__tests__/completeness.test.ts` — **insrc-build** (2026-10-08T07:13:52.438Z)
- `src/analyze/__tests__/item-length.test.ts` — **insrc-build** (2026-10-08T07:13:52.438Z)
- `src/analyze/completeness.ts` — **insrc-build** (2026-10-08T07:13:52.438Z)
- `src/analyze/item-length.ts` — **insrc-build** (2026-10-08T07:13:52.438Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-08T07:13:52.438Z)
- `src/analyze/summariser/index.ts` — **insrc-build** (2026-10-08T07:13:52.438Z)
