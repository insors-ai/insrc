<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-07T09:26:37.335Z  ·  **Updated:** 2026-10-07T09:26:37.335Z

**Commit:** 4da7bda2

## Summary

Declared the three new cause codes in both code lists with a compile-time check, added five typed errors of the context builder and an optional call on the model-unavailable error, and mapped each in the plan tree's and the daemon's shaper-error mapping. Nothing raises them yet.

## Tasks validated

- ✗ `t1`

## Changes

- `src/analyze/context/__tests__/shaper-errors.test.ts` — **insrc-build** (2026-10-07T09:26:37.335Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-07T09:26:37.335Z)
- `src/analyze/context/invariants.ts` — **insrc-build** (2026-10-07T09:26:37.335Z)
- `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` — **insrc-build** (2026-10-07T09:26:37.335Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-10-07T09:26:37.335Z)
- `src/analyze/orchestrator/types.ts` — **insrc-build** (2026-10-07T09:26:37.335Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-10-07T09:26:37.335Z)
