<!-- insrc:artifact BUILD-7d42b5dceb62afec-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-11-03T14:34:09.725Z  ·  **Updated:** 2026-11-03T15:31:50.313Z

**Commit:** 8f06acfa0

## Summary

@a41fff7b9 + fix commit. Scheduler as before (pacing on actual starts across the worker link, bounded retry back-off, re-arm on an incomplete graph, dispose on both stop paths). Fix: admit() and the retry re-arm re-check dispose/stopping after awaiting the graph's state, so a request in flight when dispose runs (or the queue stops) queues no job and arms no timer -- pinned in the dispose test with a scheduler whose graph read resolves after dispose (removing the guard fails it). Scope: the session-source-inventory fixture now refreshes only the pinned files this Story edits (src/daemon/index.ts, indexing-worker.ts, summary-link.ts, entities.ts, codec.ts, store.ts, relations.ts, repos.ts, indexer/index.ts); the cross-file-resolver entry the first commit refreshed is restored. The relations.ts entry's digest is whole-file and so also reflects ISSUE-0f3376a0's earlier edits there.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/__tests__/subsystem-changes.test.ts` — **insrc-build** (2026-11-03T15:31:50.313Z)
- `src/db/entities.ts` — **insrc-build** (2026-11-03T15:31:50.313Z)
- `src/db/subsystems.ts` — **insrc-build** (2026-11-03T15:31:50.313Z)
- `src/indexer/__tests__/subsystem-incremental.test.ts` — **insrc-build** (2026-11-03T15:31:50.313Z)
- `src/indexer/subsystem-pass.ts` — **insrc-build** (2026-11-03T15:31:50.313Z)
- `src/indexer/__tests__/subsystem-publication.test.ts` — **insrc-build** (2026-11-03T15:31:50.313Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-03T15:31:50.313Z)
- `src/daemon/index.ts` — **insrc-build** (2026-11-03T15:31:50.313Z)
- `src/daemon/threads/indexing-worker.ts` — **insrc-build** (2026-11-03T15:31:50.313Z)
- `src/daemon/threads/summary-link.ts` — **insrc-build** (2026-11-03T15:31:50.313Z)
- `src/indexer/__tests__/subsystem-scheduling.test.ts` — **insrc-build** (2026-11-03T15:31:50.313Z)
- `src/indexer/__tests__/subsystems-job.test.ts` — **insrc-build** (2026-11-03T15:31:50.313Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-03T15:31:50.313Z)
- `src/indexer/subsystem-scheduler.ts` — **insrc-build** (2026-11-03T15:31:50.313Z)
