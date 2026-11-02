<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s8 -->

# Build (plan-driven) — Story s8

**Standalone:** no  ·  **Created:** 2026-11-02T09:26:38.830Z  ·  **Updated:** 2026-11-02T09:26:38.830Z

**Commit:** f1c1e5b0a

## Summary

Added the subsystem store module (src/db/subsystems.ts). writeSubsystems replaces a repository's set in one transaction, stamped with the generation; an id already stored keeps its summary. readSubsystems reads a repository's set, or the subsystems holding the given files. The 'subsystem' and 'subsystem_by_file' databases are opened with the store, listed as structural so sessions can read them, and come with MIGRATION_V7_TO_V8 (SCHEMA_VERSION 8). Tests that pinned schema 7 and the 37-database count now say 8 and 39.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-02T09:26:38.830Z)
- `src/db/__tests__/subsystem-tables.test.ts` — **insrc-build** (2026-11-02T09:26:38.830Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-11-02T09:26:38.830Z)
- `src/db/graph/__tests__/migration-v6-to-v7.test.ts` — **insrc-build** (2026-11-02T09:26:38.830Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-11-02T09:26:38.830Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-02T09:26:38.830Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-11-02T09:26:38.830Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-02T09:26:38.830Z)
- `src/db/subsystems.ts` — **insrc-build** (2026-11-02T09:26:38.830Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-11-02T09:26:38.830Z)
