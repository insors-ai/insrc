<!-- insrc:artifact BUILD-dced43851723554f-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-18T11:35:11.055Z  ·  **Updated:** 2026-10-18T11:59:48.678Z

**Commit:** 8ec5a00b

## Summary

fullIndex marks the repository unfinished before the delete, carries its summaries through it and writes them back after the index clean-up, before finishFullIndexState (commit 8ec5a00b); test seam _afterRepositoryDeleteForTest. Three falsifying mutations each fail a test. The full sweep also showed t1's new database broke the understanding inventory count, fixed in 1908b7ba.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-dced43851723554f-S001.json` — **insrc-build** (2026-10-18T11:59:48.678Z)
- `docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/S001/PLAN.md` — **insrc-build** (2026-10-18T11:59:48.678Z)
- `docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/S001/er-model.html` — **insrc-build** (2026-10-18T11:59:48.678Z)
- `src/db/__tests__/doc-summary-carry.test.ts` — **insrc-build** (2026-10-18T11:59:48.678Z)
- `src/db/__tests__/entities-return-to-pending.test.ts` — **insrc-build** (2026-10-18T11:59:48.678Z)
- `src/db/doc-summaries.ts` — **insrc-build** (2026-10-18T11:59:48.678Z)
- `src/db/entities.ts` — **insrc-build** (2026-10-18T11:59:48.678Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-18T11:59:48.678Z)
- `src/db/index-state.ts` — **insrc-build** (2026-10-18T11:59:48.678Z)
- `src/indexer/__tests__/full-index-rebuild.test.ts` — **insrc-build** (2026-10-18T11:59:48.678Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-18T11:59:48.678Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-10-18T11:59:48.678Z)
