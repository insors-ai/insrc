<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s8 -->

# Build (plan-driven) — Story s8

**Standalone:** no  ·  **Created:** 2026-11-02T09:26:38.830Z  ·  **Updated:** 2026-11-02T09:55:10.020Z

**Commit:** 674989914

## Summary

Added the 'index.subsystems' request { repoPath }, classed 'indexing'. subsystemsAnswer in src/db/subsystems.ts builds the answer: generation, computedAtGeneration, graphComplete, stale, and the subsystems with files, entity counts, summaries and connections. The note says 'the groups rest on an incomplete graph' (ac5), 'the groups rest on an older graph' or 'not grouped yet'. An unregistered repository gets { error }. The handler-runtime, method-class and indexing-worker request lists include the new request.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/db/__tests__/subsystem-tables.test.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/db/graph/__tests__/migration-v6-to-v7.test.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/db/subsystems.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/indexer/__tests__/subsystem-grouping.test.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/indexer/subsystems.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/indexer/__tests__/subsystem-pass.test.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/indexer/subsystem-pass.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/analyze/context/boot-validator.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/analyze/summariser/subsystem-prompt.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/indexer/__tests__/subsystem-summaries.test.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/prompts/analyze/subsystem-summariser.system.md` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/daemon/__tests__/queue-lanes.test.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/daemon/threads/summary-link.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/indexer/__tests__/subsystems-job.test.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/daemon/threads/__tests__/indexing-worker.test.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
- `src/indexer/__tests__/subsystems-request.test.ts` — **insrc-build** (2026-11-02T09:55:10.020Z)
