<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-08T07:10:44.483Z  ·  **Updated:** 2026-10-08T07:10:44.483Z

**Commit:** 4444b10b

## Summary

Task t1: added src/analyze/completeness.ts with the completeness record and its builder, the answer report and its derivation, and the completeness line. One addition to the design's sketch: the report's completeness carries an optional list of the sources' distinct basis notes, so the line can state a shared note once. Five tests pass under Node 22 and five mutations each make one fail.

## Tasks validated

- ✗ `t1`

## Changes

- `src/analyze/__tests__/completeness.test.ts` — **insrc-build** (2026-10-08T07:10:44.483Z)
- `src/analyze/completeness.ts` — **insrc-build** (2026-10-08T07:10:44.483Z)
