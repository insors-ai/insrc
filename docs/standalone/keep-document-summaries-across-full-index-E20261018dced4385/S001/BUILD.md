<!-- insrc:artifact BUILD-dced43851723554f-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-18T11:35:11.055Z  ·  **Updated:** 2026-10-18T13:53:49.427Z

**Commit:** a9e9933d

## Summary

Pushed t1-t5 to main and updated the installed daemon (0fb0c2b7). The restore wrote 21,993 of the backup's 22,216 summaries (summary rows 321 -> 22,277 across six repositories); a second run wrote 0 and the backup's SHA-256 is unchanged. A reindex of this repository carried 10,996 summaries and wrote all 10,996 back. Evidence in smoke.md (52162130).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-dced43851723554f-S001.json` — **insrc-build** (2026-10-18T13:53:49.427Z)
- `docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/S001/PLAN.md` — **insrc-build** (2026-10-18T13:53:49.427Z)
- `docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/S001/er-model.html` — **insrc-build** (2026-10-18T13:53:49.427Z)
- `docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/S001/smoke.md` — **insrc-build** (2026-10-18T13:53:49.427Z)
- `src/analyze/summariser/__tests__/summarise-doc-current.test.ts` — **insrc-build** (2026-10-18T13:53:49.427Z)
- `src/analyze/summariser/driver.ts` — **insrc-build** (2026-10-18T13:53:49.427Z)
- `src/daemon/__tests__/doc-summary-restore-ipc.test.ts` — **insrc-build** (2026-10-18T13:53:49.427Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-18T13:53:49.427Z)
- `src/db/__tests__/doc-summary-carry.test.ts` — **insrc-build** (2026-10-18T13:53:49.427Z)
- `src/db/__tests__/doc-summary-restore.test.ts` — **insrc-build** (2026-10-18T13:53:49.427Z)
- `src/db/__tests__/entities-return-to-pending.test.ts` — **insrc-build** (2026-10-18T13:53:49.427Z)
- `src/db/doc-summaries.ts` — **insrc-build** (2026-10-18T13:53:49.427Z)
- `src/db/entities.ts` — **insrc-build** (2026-10-18T13:53:49.427Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-18T13:53:49.427Z)
- `src/db/index-state.ts` — **insrc-build** (2026-10-18T13:53:49.427Z)
- `src/indexer/__tests__/doc-summary-sweep.test.ts` — **insrc-build** (2026-10-18T13:53:49.427Z)
- `src/indexer/__tests__/full-index-rebuild.test.ts` — **insrc-build** (2026-10-18T13:53:49.427Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-18T13:53:49.427Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-10-18T13:53:49.427Z)
