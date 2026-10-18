<!-- insrc:artifact BUILD-dced43851723554f-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-18T11:35:11.055Z  ·  **Updated:** 2026-10-18T11:37:51.234Z

**Commit:** de2915cb

## Summary

Added doc_summary_carry, writeDocSummaryIfCurrentInTxn (onlyIfAbsent, keepGoodSummary) behind an overloaded writeDocSummaryIfCurrent, and restoreCarriedDocSummaries (batches of 500, carry row removed with its outcome). Commits 5b706f19 and de2915cb; the second restores the no-options order (repo checked only for a write, index under the caller's repo), pinned by tests that fail under each mutation.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/__tests__/doc-summary-carry.test.ts` — **insrc-build** (2026-10-18T11:37:51.234Z)
- `src/db/doc-summaries.ts` — **insrc-build** (2026-10-18T11:37:51.234Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-18T11:37:51.234Z)
