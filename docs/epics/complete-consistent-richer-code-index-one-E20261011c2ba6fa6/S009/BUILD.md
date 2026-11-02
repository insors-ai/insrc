<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s9 -->

# Build (plan-driven) — Story s9

**Standalone:** no  ·  **Created:** 2026-11-02T05:01:33.548Z  ·  **Updated:** 2026-11-02T05:01:33.548Z

**Commit:** 7348f340d

## Summary

New languages (rust/csharp/c/cpp) and extensions, table/view kind slots, cargo/nuget/native namespaces with a v6-to-v7 provisioning step (schema 7), and the five pinned grammars, which install with the repo's .npmrc and load under Node 22 (checked with require + setLanguage in the repo).

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `package-lock.json` — **insrc-build** (2026-11-02T05:01:33.548Z)
- `package.json` — **insrc-build** (2026-11-02T05:01:33.548Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-02T05:01:33.548Z)
- `src/db/__tests__/repo-strict-contract.test.ts` — **insrc-build** (2026-11-02T05:01:33.548Z)
- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-02T05:01:33.548Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-11-02T05:01:33.548Z)
- `src/db/graph/__tests__/migration-v6-to-v7.test.ts` — **insrc-build** (2026-11-02T05:01:33.548Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-11-02T05:01:33.548Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-02T05:01:33.548Z)
- `src/db/graph/keys.ts` — **insrc-build** (2026-11-02T05:01:33.548Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-11-02T05:01:33.548Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-02T05:01:33.548Z)
- `src/indexer/resolver.ts` — **insrc-build** (2026-11-02T05:01:33.548Z)
- `src/shared/repo-namespaces.ts` — **insrc-build** (2026-11-02T05:01:33.548Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-02T05:01:33.548Z)
