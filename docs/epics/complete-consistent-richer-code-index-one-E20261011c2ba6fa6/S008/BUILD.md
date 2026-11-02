<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s8 -->

# Build (plan-driven) — Story s8

**Standalone:** no  ·  **Created:** 2026-11-02T09:26:38.830Z  ·  **Updated:** 2026-11-02T09:46:53.914Z

**Commit:** 7182d1d58

## Summary

runSubsystemPass now summarises each subsystem with no summary after the grouping. It makes one completeStructured call through buildSummariserProvider (tiers.cheap, injectable), with a yield between calls and never two at once. The prompt is src/prompts/analyze/subsystem-summariser.system.md, shipped by copy-assets and registered with the boot validator through src/analyze/summariser/subsystem-prompt.ts. Its input is the subsystem's name, its files with their exported names, and its connections by name. A failed call is logged and counted, and the summary stays null. The generation is re-read before each call and before each write, and the loop stops if it advanced. writeSubsystemSummary sets a summary only on the row grouped at that generation.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-02T09:46:53.914Z)
- `src/db/__tests__/subsystem-tables.test.ts` — **insrc-build** (2026-11-02T09:46:53.914Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-11-02T09:46:53.914Z)
- `src/db/graph/__tests__/migration-v6-to-v7.test.ts` — **insrc-build** (2026-11-02T09:46:53.914Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-11-02T09:46:53.914Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-02T09:46:53.914Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-11-02T09:46:53.914Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-02T09:46:53.914Z)
- `src/db/subsystems.ts` — **insrc-build** (2026-11-02T09:46:53.914Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-11-02T09:46:53.914Z)
- `src/indexer/__tests__/subsystem-grouping.test.ts` — **insrc-build** (2026-11-02T09:46:53.914Z)
- `src/indexer/subsystems.ts` — **insrc-build** (2026-11-02T09:46:53.914Z)
- `src/indexer/__tests__/subsystem-pass.test.ts` — **insrc-build** (2026-11-02T09:46:53.914Z)
- `src/indexer/subsystem-pass.ts` — **insrc-build** (2026-11-02T09:46:53.914Z)
- `src/analyze/context/boot-validator.ts` — **insrc-build** (2026-11-02T09:46:53.914Z)
- `src/analyze/summariser/subsystem-prompt.ts` — **insrc-build** (2026-11-02T09:46:53.914Z)
- `src/indexer/__tests__/subsystem-summaries.test.ts` — **insrc-build** (2026-11-02T09:46:53.914Z)
- `src/prompts/analyze/subsystem-summariser.system.md` — **insrc-build** (2026-11-02T09:46:53.914Z)
