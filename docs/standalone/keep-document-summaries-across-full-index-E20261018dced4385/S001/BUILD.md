<!-- insrc:artifact BUILD-dced43851723554f-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-18T11:35:11.055Z  ·  **Updated:** 2026-10-18T11:42:35.906Z

**Commit:** 6cf6945e

## Summary

deleteEntitiesForRepo gained carryDocSummaries (carry written first in the delete's own transaction hook) and, without it, clears the repository's carry rows in a transaction of its own that runs with no entities left; the result gains carriedDocSummaries. Commit 6cf6945e; five falsifying mutations each fail a test.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-dced43851723554f-S001.json` — **insrc-build** (2026-10-18T11:42:35.906Z)
- `docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/S001/PLAN.md` — **insrc-build** (2026-10-18T11:42:35.906Z)
- `docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/S001/er-model.html` — **insrc-build** (2026-10-18T11:42:35.906Z)
- `src/db/__tests__/doc-summary-carry.test.ts` — **insrc-build** (2026-10-18T11:42:35.906Z)
- `src/db/__tests__/entities-return-to-pending.test.ts` — **insrc-build** (2026-10-18T11:42:35.906Z)
- `src/db/doc-summaries.ts` — **insrc-build** (2026-10-18T11:42:35.906Z)
- `src/db/entities.ts` — **insrc-build** (2026-10-18T11:42:35.906Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-18T11:42:35.906Z)
