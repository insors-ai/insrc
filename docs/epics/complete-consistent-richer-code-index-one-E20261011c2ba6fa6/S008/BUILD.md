<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s8 -->

# Build (plan-driven) — Story s8

**Standalone:** no  ·  **Created:** 2026-11-02T09:26:38.830Z  ·  **Updated:** 2026-11-02T09:51:03.089Z

**Commit:** 72314d819

## Summary

Added the job kind { kind: 'subsystems'; repoPath } to the IndexJob union. Both isSummaryJob predicates (src/daemon/queue.ts and src/daemon/threads/summary-link.ts) route it to the summary lane, which starts only while the index lane is idle and hands its jobs to the summary worker. A queued job per repository is deduped. IndexerService.processJob runs it through a protected subsystemPass(repoPath), which calls runSubsystemPass; it's a seam so tests run no model. enqueueSubsystemsIfComplete queues it at the end of a full index, a settle (runSettlePass) and a clean-up (resolveAfterReconcile) when readIndexState(repo).graphComplete is true. The queue-lanes test's label switch learned the new kind.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/db/__tests__/subsystem-tables.test.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/db/graph/__tests__/migration-v6-to-v7.test.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/db/subsystems.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/indexer/__tests__/subsystem-grouping.test.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/indexer/subsystems.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/indexer/__tests__/subsystem-pass.test.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/indexer/subsystem-pass.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/analyze/context/boot-validator.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/analyze/summariser/subsystem-prompt.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/indexer/__tests__/subsystem-summaries.test.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/prompts/analyze/subsystem-summariser.system.md` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/daemon/__tests__/queue-lanes.test.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/daemon/threads/summary-link.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/indexer/__tests__/subsystems-job.test.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-02T09:51:03.089Z)
