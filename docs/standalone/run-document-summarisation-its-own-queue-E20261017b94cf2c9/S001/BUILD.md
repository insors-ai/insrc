<!-- insrc:artifact BUILD-b94cf2c9058fd82a-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-17T13:31:05.601Z  ·  **Updated:** 2026-10-17T13:43:11.087Z

**Commit:** 099f6dcc

## Summary

writeDocSummaryIfCurrent looks up the entity id, reads its row and compares sha256 of the stored body with summary.contentHash inside one write transaction (atomic with the entity delete, which removes the id mapping, row and summary together), then writes the same two rows writeDocSummary writes through its own helper. writeDocSummary is byte-for-byte unchanged (b9d84623 restored it after the gate's first verdict). summariseDoc routes both writes through the new function: entity-gone / body-changed become { ok: false, skipped }, a thrown summary write stays persistence-failed, a thrown placeholder write keeps the model error. Five of six mutations fail the tests; the sixth (writing when the row is absent but the id mapping is present) is equivalent, since that state cannot occur.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/TESTS-670419c4ad8bea8e-s1.json` — **insrc-build** (2026-10-17T13:43:11.087Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/TESTS.md` — **insrc-build** (2026-10-17T13:43:11.087Z)
