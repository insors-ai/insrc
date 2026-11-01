<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-11-01T13:16:17.185Z  ·  **Updated:** 2026-11-01T13:27:03.535Z

**Commit:** 5135e9d55

## Summary

commitFile grown from reindexFile: one withWriteTxn reads the file's previous entities through entity_by_file, upserts the parsed ones, removes those no longer parsed, advances the generation and drops the file from uncommittedFiles; contentHash null removes the file's entities; reindexFile is a thin wrapper whose 14 existing tests pass. src/db suites: 635/635 pass.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-01T13:27:03.535Z)
- `src/db/__tests__/relations-in-txn.test.ts` — **insrc-build** (2026-11-01T13:27:03.535Z)
- `src/db/relations.ts` — **insrc-build** (2026-11-01T13:27:03.535Z)
- `src/db/__tests__/file-commit-types.test.ts` — **insrc-build** (2026-11-01T13:27:03.535Z)
- `src/db/file-commit.ts` — **insrc-build** (2026-11-01T13:27:03.535Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-01T13:27:03.535Z)
- `src/db/__tests__/file-commit.test.ts` — **insrc-build** (2026-11-01T13:27:03.535Z)
- `src/db/entities.ts` — **insrc-build** (2026-11-01T13:27:03.535Z)
