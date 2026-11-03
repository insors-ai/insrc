<!-- insrc:artifact BUILD-7d42b5dceb62afec-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-11-03T14:34:09.725Z  ·  **Updated:** 2026-11-03T14:39:01.676Z

**Commit:** f8e36664f

## Summary

@fe1d42528, @067af4f5e and the test commit: src/db/subsystem-changes.ts and two sub-databases; the changed-file record is written in-transaction at every grouping-input change (the file commit once per commit; upsertRelations outside a commit; promotions; deleteResolvedRelations; the SQL re-check; the incoming sweep of a removed entity; entity-row removal on every other path). The first t1 test now also covers an outgoing grouping-edge sweep (deleting an entity that holds a CALLS edge records its own file, not the target's) and transactional atomicity (a write transaction that records and then throws leaves no entry, read back after reopening the store; withWriteTxn uses childTransaction, which aborts on a throw). Mutation check: 15 mutants, all caught. Related suites: 368 pass.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/__tests__/subsystem-changes.test.ts` — **insrc-build** (2026-11-03T14:39:01.676Z)
- `src/db/entities.ts` — **insrc-build** (2026-11-03T14:39:01.676Z)
