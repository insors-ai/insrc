<!-- insrc:artifact BUILD-7d42b5dceb62afec-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-11-03T14:34:09.725Z  ·  **Updated:** 2026-11-03T15:00:39.422Z

**Commit:** 1467e753a

## Summary

t3 commit: runSubsystemPass reads the repository's reset counter first, then publishes in ONE withWriteTxn: it re-reads the counter and returns false (publishing nothing; result reason 'superseded', fullPassDone not set) when it changed; otherwise clears rows (full), writes the recomputed rows, consumes the record entries read (stamp-checked), and writes the groups with writeSubsystemsInTxn or restamps them. withWriteTxn uses childTransaction, which aborts on a throw. Test seams: beforePublish (awaited before the transaction) and inPublish (inside it). Tests: a fault in the transaction leaves groups, rows and record exactly as before, read after reopening the store, and the next pass converges to a forced full pass; an edge written while the pass is held before publishing keeps its record entry with a newer stamp and the next pass includes it; a pass held across a full index (an isolated file deleted from disk) publishes nothing and the next full pass drops the file and equals a forced full pass. Mutation check: 4 mutants (guard removed, guard value, groups outside the transaction, publication split into two transactions), all caught.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/__tests__/subsystem-changes.test.ts` — **insrc-build** (2026-11-03T15:00:39.422Z)
- `src/db/entities.ts` — **insrc-build** (2026-11-03T15:00:39.422Z)
- `src/db/subsystems.ts` — **insrc-build** (2026-11-03T15:00:39.422Z)
- `src/indexer/__tests__/subsystem-incremental.test.ts` — **insrc-build** (2026-11-03T15:00:39.422Z)
- `src/indexer/subsystem-pass.ts` — **insrc-build** (2026-11-03T15:00:39.422Z)
- `src/indexer/__tests__/subsystem-publication.test.ts` — **insrc-build** (2026-11-03T15:00:39.422Z)
