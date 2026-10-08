<!-- insrc:artifact BUILD-2ff0dfdadb1c8d1c-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-08T12:12:36.037Z  ·  **Updated:** 2026-10-08T14:19:51.454Z

**Commit:** 2912cc33

## Summary

Adds the sc5 gate types and the gate pass (gate.ts): one artifact gate per record with approval, review, effective verdict and blocking, and one item gate per epic, story and issue with task validation, the story-level result, the approved-but-failed conflict, attention reasons under the confirmed superseded-pending rule, and unplanned-task / validation-conflict notices.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

## Changes

- `src/workflow/delivery/__tests__/gate.test.ts` — **insrc-build** (2026-10-08T14:19:51.454Z)
- `src/workflow/delivery/__tests__/read.test.ts` — **insrc-build** (2026-10-08T14:19:51.454Z)
- `src/workflow/delivery/__tests__/types.test.ts` — **insrc-build** (2026-10-08T14:19:51.454Z)
- `src/workflow/delivery/gate.ts` — **insrc-build** (2026-10-08T14:19:51.454Z)
- `src/workflow/delivery/graph.ts` — **insrc-build** (2026-10-08T14:19:51.454Z)
- `src/workflow/delivery/load.ts` — **insrc-build** (2026-10-08T14:19:51.454Z)
- `src/workflow/delivery/read.ts` — **insrc-build** (2026-10-08T14:19:51.454Z)
- `src/workflow/delivery/types.ts` — **insrc-build** (2026-10-08T14:19:51.454Z)
- `src/workflow/review/resolve.ts` — **insrc-build** (2026-10-08T14:19:51.454Z)
