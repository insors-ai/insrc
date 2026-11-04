<!-- insrc:artifact BUILD-3c0b242fcabf01e9-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-04T08:41:18.063Z  ·  **Updated:** 2026-11-04T08:56:14.630Z

**Commit:** 5f4895a88

## Summary

Repair of AMD-86197ac660732ceb-1 and -2 done with the one-off script docs/standalone/stop-flat-amendment-heads-from-blocking-E202611043c0b242f/S001/repair-flat-amendments.ts: first on a copy (repair-copy-run.txt), then on this repository (repair-apply-run.txt, commit f5c9ec5b4); the strict child scan now finds no unreadable head (scan-unreadable-output.txt). Recorded here as the user decided on 2026-11-04: (1) the process that wrote the two flat records after the 2026-10-22 conversion is NOT established; the likeliest cause is an older daemon build handling those amendments (commits 2e2fd5d72, 5a55f9b7d, da59c2669), unverified. (2) The roll-up narrowing in countedChildren (the sc4 lifecycle contract of epic one-common-model-every-artifact, HLD-2f27754d4ad00b8e, owned by that epic's s3) is recorded in ISSUE-3c0b242fcabf01e9 and in this BUILD instead of an HLD amendment; the sc4 signature is unchanged. The LLD was approved with an override after three review rounds (round 3 incomplete: its framing chunk returned placeholder text); its follow-ups were built as t2 to t4. repairFlatAmendments is in repair-amendments.ts, not amendments.ts, to avoid a load-order cycle with apply.ts. The narrowing is live in the installed daemon only after the user pushes v2 and the daemon is updated.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✗ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `src/workflow/artifact-core/lifecycle.ts` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `src/workflow/amendments/store.ts` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `src/workflow/convert/__tests__/convert-lifecycle-backfill.test.ts` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `src/workflow/convert/backfill.ts` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `src/workflow/convert/__tests__/convert-apply.test.ts` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `src/workflow/convert/apply.ts` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `src/workflow/artifact-core/__tests__/store-children-strict.test.ts` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `src/workflow/convert/__tests__/convert-amendments.test.ts` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `src/workflow/convert/amendments.ts` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `src/workflow/convert/repair-amendments.ts` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `.insrc/artifacts/AMD-86197ac660732ceb-1.json` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `.insrc/artifacts/AMD-86197ac660732ceb-1.log.jsonl` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `.insrc/artifacts/AMD-86197ac660732ceb-2.json` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `.insrc/artifacts/AMD-86197ac660732ceb-2.log.jsonl` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `docs/standalone/stop-flat-amendment-heads-from-blocking-E202611043c0b242f/S001/repair-apply-run.txt` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `docs/standalone/stop-flat-amendment-heads-from-blocking-E202611043c0b242f/S001/repair-copy-run.txt` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `docs/standalone/stop-flat-amendment-heads-from-blocking-E202611043c0b242f/S001/repair-flat-amendments.ts` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `docs/standalone/stop-flat-amendment-heads-from-blocking-E202611043c0b242f/S001/scan-unreadable-output.txt` — **insrc-build** (2026-11-04T08:56:14.630Z)
- `docs/standalone/stop-flat-amendment-heads-from-blocking-E202611043c0b242f/S001/scan-unreadable.ts` — **insrc-build** (2026-11-04T08:56:14.630Z)
