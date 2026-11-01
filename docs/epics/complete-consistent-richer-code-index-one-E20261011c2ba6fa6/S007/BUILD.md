<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s7 -->

# Build (plan-driven) — Story s7

**Standalone:** no  ·  **Created:** 2026-11-01T19:07:14.344Z  ·  **Updated:** 2026-11-01T19:07:14.344Z

**Commit:** 71b4348d2

## Summary

Evidence type widened to five values, RelationRead added, Relation.evidence optional; one-byte edge-row codec with empty/0x00/undefined bytes reading 'unknown' and invalid strings encoded empty and flagged.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-01T19:07:14.344Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-01T19:07:14.344Z)
- `src/db/graph/__tests__/evidence-codec.test.ts` — **insrc-build** (2026-11-01T19:07:14.344Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-01T19:07:14.344Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-01T19:07:14.344Z)
