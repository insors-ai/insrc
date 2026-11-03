<!-- insrc:artifact BUILD-7d42b5dceb62afec-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-11-03T14:34:09.725Z  ·  **Updated:** 2026-11-03T17:13:56.491Z

**Commit:** 4e4d92298

## Summary

Installed daemon (1f1c2ebf), smoke-t5.md: on the registered 3774-file clone of insors-extraction, a comment-only save gave a pass in mode unchanged, filesRead 1, 47 ms (no regroup); a save adding a cross-file call gave mode incremental, filesRead 1, 248 ms, 94 -> 93 groups regrouped in memory; the first pass per repository after the restart was full, as designed. Before/after, cost-t5.md: the old pass (worktree at 1a000fe9d) on the same repository read every entity and edge on every save (530 ms after a comment-only save, 518 ms after a cross-file save) against 13-25 ms and 67 ms for the new pass in the same harness. The before numbers could not be taken on the installed daemon: its summary lane held 156-399 document-summary jobs ahead of the clone's first pass, and once updated it no longer runs the old pass; this deviation is recorded in cost-t5.md. Full sweep, full-sweep-t5.md: all 38 failed cases listed one by one, each with whether it failed in an earlier sweep and its classification; the two this Story caused are fixed (e2ecc4b9f, c53f2db0e); this Story's four subsystem files are now classified in the session-source inventory (084630837).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✗ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/__tests__/subsystem-changes.test.ts` — **insrc-build** (2026-11-03T17:04:51.021Z)
- `src/db/entities.ts` — **insrc-build** (2026-11-03T17:04:51.021Z)
- `src/db/subsystems.ts` — **insrc-build** (2026-11-03T17:04:51.021Z)
- `src/indexer/__tests__/subsystem-incremental.test.ts` — **insrc-build** (2026-11-03T17:04:51.021Z)
- `src/indexer/subsystem-pass.ts` — **insrc-build** (2026-11-03T17:04:51.021Z)
- `src/indexer/__tests__/subsystem-publication.test.ts` — **insrc-build** (2026-11-03T17:04:51.021Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-03T17:04:51.021Z)
- `src/daemon/index.ts` — **insrc-build** (2026-11-03T17:04:51.021Z)
- `src/daemon/threads/indexing-worker.ts` — **insrc-build** (2026-11-03T17:04:51.021Z)
- `src/daemon/threads/summary-link.ts` — **insrc-build** (2026-11-03T17:04:51.021Z)
- `src/indexer/__tests__/subsystem-scheduling.test.ts` — **insrc-build** (2026-11-03T17:04:51.021Z)
- `src/indexer/__tests__/subsystems-job.test.ts` — **insrc-build** (2026-11-03T17:04:51.021Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-03T17:04:51.021Z)
- `src/indexer/subsystem-scheduler.ts` — **insrc-build** (2026-11-03T17:04:51.021Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-03T17:04:51.021Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-11-03T17:04:51.021Z)
- `docs/standalone/subsystem-pass-regroups-whole-repository-after-E202611027d42b5dc/S001/cost-t5.md` — **insrc-build** (2026-11-03T17:04:51.021Z)
- `docs/standalone/subsystem-pass-regroups-whole-repository-after-E202611027d42b5dc/S001/full-sweep-t5.md` — **insrc-build** (2026-11-03T17:04:51.021Z)
- `docs/standalone/subsystem-pass-regroups-whole-repository-after-E202611027d42b5dc/S001/smoke-t5.md` — **insrc-build** (2026-11-03T17:04:51.021Z)
