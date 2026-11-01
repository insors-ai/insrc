<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-11-01T13:16:17.185Z  ·  **Updated:** 2026-11-01T13:32:16.352Z

**Commit:** c7a2d5762

## Summary

commitFile now replaces the file's relationships in the same transaction as its entities: outgoing edges of every previous entity and the file's pending rows removed, incoming relationships of removed entities returned to pending, new relationships written by s1's rule through t1's in-transaction writers. src/db + src/indexer suites: 944/944 pass.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-01T13:32:16.352Z)
- `src/db/__tests__/relations-in-txn.test.ts` — **insrc-build** (2026-11-01T13:32:16.352Z)
- `src/db/relations.ts` — **insrc-build** (2026-11-01T13:32:16.352Z)
- `src/db/__tests__/file-commit-types.test.ts` — **insrc-build** (2026-11-01T13:32:16.352Z)
- `src/db/file-commit.ts` — **insrc-build** (2026-11-01T13:32:16.352Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-01T13:32:16.352Z)
- `src/db/__tests__/file-commit.test.ts` — **insrc-build** (2026-11-01T13:32:16.352Z)
- `src/db/entities.ts` — **insrc-build** (2026-11-01T13:32:16.352Z)
