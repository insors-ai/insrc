<!-- insrc:artifact BUILD-dced43851723554f-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-18T11:35:11.055Z  ·  **Updated:** 2026-10-18T12:02:07.434Z

**Commit:** a2681288

## Summary

summariseDoc writes its error placeholder with keepGoodSummary and reports skipped 'kept-good' (with the model error) when a good summary of the same body was stored meanwhile; SummariseDocResult.skipped gains 'kept-good'; the sweep counts it as skipped through its existing branch. Commit a2681288; three falsifying mutations each fail a test.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-dced43851723554f-S001.json` — **insrc-build** (2026-10-18T12:02:07.434Z)
- `docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/S001/PLAN.md` — **insrc-build** (2026-10-18T12:02:07.434Z)
- `docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/S001/er-model.html` — **insrc-build** (2026-10-18T12:02:07.434Z)
- `src/analyze/summariser/__tests__/summarise-doc-current.test.ts` — **insrc-build** (2026-10-18T12:02:07.434Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-18T12:02:07.434Z)
- `src/db/__tests__/doc-summary-carry.test.ts` — **insrc-build** (2026-10-18T12:02:07.434Z)
- `src/db/__tests__/entities-return-to-pending.test.ts` — **insrc-build** (2026-10-18T12:02:07.434Z)
- `src/db/doc-summaries.ts` — **insrc-build** (2026-10-18T12:02:07.434Z)
- `src/db/entities.ts` — **insrc-build** (2026-10-18T12:02:07.434Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-18T12:02:07.434Z)
- `src/db/index-state.ts` — **insrc-build** (2026-10-18T12:02:07.434Z)
- `src/indexer/__tests__/doc-summary-sweep.test.ts` — **insrc-build** (2026-10-18T12:02:07.434Z)
- `src/indexer/__tests__/full-index-rebuild.test.ts` — **insrc-build** (2026-10-18T12:02:07.434Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-18T12:02:07.434Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-10-18T12:02:07.434Z)
