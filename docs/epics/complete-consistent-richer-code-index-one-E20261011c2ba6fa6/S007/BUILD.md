<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s7 -->

# Build (plan-driven) — Story s7

**Standalone:** no  ·  **Created:** 2026-11-01T19:07:14.344Z  ·  **Updated:** 2026-11-01T19:11:49.297Z

**Commit:** 3537ca63c

## Summary

Both edge writers store the evidence byte on both rows; invalid evidence stored empty with a warn; pending rows carry meta.evidence through awaiting and return-to-pending, and promotion stores the given or carried value.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-01T19:11:49.297Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-01T19:11:49.297Z)
- `src/db/graph/__tests__/evidence-codec.test.ts` — **insrc-build** (2026-11-01T19:11:49.297Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-01T19:11:49.297Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-01T19:11:49.297Z)
- `src/db/__tests__/relations-evidence.test.ts` — **insrc-build** (2026-11-01T19:11:49.297Z)
- `src/db/relations.ts` — **insrc-build** (2026-11-01T19:11:49.297Z)
