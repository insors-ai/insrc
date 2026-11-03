<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s8 -->

# Build (plan-driven) — Story s8

**Standalone:** no  ·  **Created:** 2026-11-02T09:26:38.830Z  ·  **Updated:** 2026-11-02T11:36:55.095Z

**Commit:** 41342067d

## Summary

The full sweep is recorded in S008/full-sweep-t8.txt: run at 1f8351455 (all of t1-t7), 7334 tests, 7164 passed, 32 failed, every failure listed and classified, none caused by s8. Ten are the seeded test daemon that does not start, a pre-existing failure. Two are load flakes that pass alone (threads-boot SIGTERM, tui-models). The rest are the other session's connection-manager and project-memory work. CM-S3-INVENTORY is the other epic's frozen snapshot, which now also lists s8's two new files; that baseline is not edited here. The stub summary worker was fixed (2befc2d83) so stub mode calls no model. Smoke on the installed daemon @ 2befc2d8 is recorded in S008/smoke-t8.txt: 5 subsystems with 5 summaries on the s9 smoke repository, an analyzer context naming the cpp subsystem, and insrc itself reported incomplete (5 relationships point at ignored files) and so not grouped.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/db/graph/__tests__/migration-v6-to-v7.test.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/indexer/__tests__/subsystem-pass.test.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/analyze/context/boot-validator.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/analyze/summariser/subsystem-prompt.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/daemon/__tests__/queue-lanes.test.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/daemon/threads/summary-link.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/daemon/threads/__tests__/indexing-worker.test.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/indexer/__tests__/subsystems-request.test.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S008/smoke-t8.txt` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S008/full-sweep-t8.txt` — **insrc-build** (2026-11-02T10:48:02.439Z)
- `src/db/__tests__/subsystem-tables.test.ts` — **insrc-build** (2026-11-02T11:36:55.095Z)
- `src/db/subsystems.ts` — **insrc-build** (2026-11-02T11:36:55.095Z)
- `src/indexer/__tests__/subsystem-grouping.test.ts` — **insrc-build** (2026-11-02T11:36:55.095Z)
- `src/indexer/subsystems.ts` — **insrc-build** (2026-11-02T11:36:55.095Z)
- `src/indexer/subsystem-pass.ts` — **insrc-build** (2026-11-02T11:36:55.095Z)
- `src/indexer/__tests__/subsystem-summaries.test.ts` — **insrc-build** (2026-11-02T11:36:55.095Z)
- `src/prompts/analyze/subsystem-summariser.system.md` — **insrc-build** (2026-11-02T11:36:55.095Z)
- `src/indexer/__tests__/subsystems-job.test.ts` — **insrc-build** (2026-11-02T11:36:55.095Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-02T11:36:55.095Z)
- `src/analyze/context/__tests__/subsystem-context.test.ts` — **insrc-build** (2026-11-02T11:36:55.095Z)
- `src/analyze/context/subsystem-context.ts` — **insrc-build** (2026-11-02T11:36:55.095Z)
- `src/daemon/threads/summary-worker.ts` — **insrc-build** (2026-11-02T11:36:55.095Z)
- `src/daemon/steps/__tests__/analyze-step-subsystems.test.ts` — **insrc-build** (2026-11-02T11:36:55.095Z)
- `src/daemon/steps/analyze-step/phases/bundle.ts` — **insrc-build** (2026-11-02T11:36:55.095Z)
- `src/db/repos.ts` — **insrc-build** (2026-11-02T11:36:55.095Z)
