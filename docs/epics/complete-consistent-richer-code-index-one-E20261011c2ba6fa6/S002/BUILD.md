<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-11-01T13:16:17.185Z  ·  **Updated:** 2026-11-01T14:59:32.825Z

**Commit:** 9ee41aac7

## Summary

IndexState.unembedded kept live in the single entity-row put/remove path (a row counts when its body is non-empty and its marker empty) and recounted on open. Three no-embedder tests that assert a complete repository now record embeddingAvailable false, as the backfill (t10) will. db, indexer, analyze and daemon-steps suites pass.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-01T14:59:32.825Z)
- `src/db/__tests__/relations-in-txn.test.ts` — **insrc-build** (2026-11-01T14:59:32.825Z)
- `src/db/relations.ts` — **insrc-build** (2026-11-01T14:59:32.825Z)
- `src/db/__tests__/file-commit-types.test.ts` — **insrc-build** (2026-11-01T14:59:32.825Z)
- `src/db/file-commit.ts` — **insrc-build** (2026-11-01T14:59:32.825Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-01T14:59:32.825Z)
- `src/db/__tests__/file-commit.test.ts` — **insrc-build** (2026-11-01T14:59:32.825Z)
- `src/db/entities.ts` — **insrc-build** (2026-11-01T14:59:32.825Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-01T14:59:32.825Z)
- `src/db/__tests__/file-commit-vectors.test.ts` — **insrc-build** (2026-11-01T14:59:32.825Z)
- `src/indexer/embedder.ts` — **insrc-build** (2026-11-01T14:59:32.825Z)
- `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` — **insrc-build** (2026-11-01T14:59:32.825Z)
- `src/db/graph/index-state-rows.ts` — **insrc-build** (2026-11-01T14:59:32.825Z)
- `src/indexer/__tests__/cross-file-modes.test.ts` — **insrc-build** (2026-11-01T14:59:32.825Z)
- `src/indexer/__tests__/full-index-rebuild.test.ts` — **insrc-build** (2026-11-01T14:59:32.825Z)
