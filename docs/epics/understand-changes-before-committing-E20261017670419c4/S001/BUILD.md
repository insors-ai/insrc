<!-- insrc:artifact BUILD-670419c4ad8bea8e-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-17T13:09:28.300Z  ·  **Updated:** 2026-10-17T13:34:07.366Z

**Commit:** 8d3f6bc1

## Summary

Reconciled revision-before-replay with approved LLD §3.4: compute current revision match before replay; exact retry additionally proves stored appliedRevision equals expectedRevision+1 and does not exceed current revision. It returns current view plus original appliedRevision without mutation, as explicitly required by LLD and t4. Fresh stale commands still conflict. Added real-RPC replay evidence; eight tests and typecheck pass.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-17T13:34:07.366Z)
- `src/db/__tests__/doc-summaries-lmdb.test.ts` — **insrc-build** (2026-10-17T13:34:07.366Z)
- `src/db/doc-summaries.ts` — **insrc-build** (2026-10-17T13:34:07.366Z)
