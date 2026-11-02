<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s8 -->

# Build (plan-driven) — Story s8

**Standalone:** no  ·  **Created:** 2026-11-02T09:26:38.830Z  ·  **Updated:** 2026-11-02T10:00:37.755Z

**Commit:** 32cc19900

## Summary

Added withSubsystemContext (src/analyze/context/subsystem-context.ts). It appends a code-written 'Subsystems' block to the bundle's structure layer: for each subsystem holding a stored code file under the scope path, or a file the bundle cites as path or path:line, its name, summary, connections (by subsystem name, with weight and kinds) and member files, then the incomplete/older-graph note. Only files with a stored subsystem_by_file row select one. The block is added as each bundle is served, through one helper in the driver, on all three paths: runShaper's built and cache-hit bundles, and the saved-cache read (readUnattachedSavedShaperCache), which runShaperAtEntry serves without calling runShaper. It runs after any cache write, so the cache never holds the block. With no repository, no stored subsystems or none touched, the bundle is unchanged.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/db/__tests__/subsystem-tables.test.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/db/graph/__tests__/migration-v6-to-v7.test.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/db/subsystems.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/indexer/__tests__/subsystem-grouping.test.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/indexer/subsystems.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/indexer/__tests__/subsystem-pass.test.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/indexer/subsystem-pass.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/analyze/context/boot-validator.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/analyze/summariser/subsystem-prompt.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/indexer/__tests__/subsystem-summaries.test.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/prompts/analyze/subsystem-summariser.system.md` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/daemon/__tests__/queue-lanes.test.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/daemon/threads/summary-link.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/indexer/__tests__/subsystems-job.test.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/daemon/threads/__tests__/indexing-worker.test.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/indexer/__tests__/subsystems-request.test.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/analyze/context/__tests__/subsystem-context.test.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
- `src/analyze/context/subsystem-context.ts` — **insrc-build** (2026-11-02T10:00:37.755Z)
