<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s9 -->

# Build (plan-driven) — Story s9

**Standalone:** no  ·  **Created:** 2026-11-02T05:01:33.548Z  ·  **Updated:** 2026-11-02T05:07:15.705Z

**Commit:** bf7897d48

## Summary

Guarded reader loads record unavailable readers with their reason; the index.languages request (indexing class) lists every code and SQL language with extensions and availability from the worker's registry.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `package-lock.json` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `package.json` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/db/__tests__/repo-strict-contract.test.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/db/graph/__tests__/migration-v6-to-v7.test.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/db/graph/keys.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/indexer/resolver.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/shared/repo-namespaces.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/daemon/threads/__tests__/indexing-worker.test.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/indexer/parser/__tests__/registry-languages.test.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/indexer/parser/kotlin.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
- `src/indexer/parser/registry.ts` — **insrc-build** (2026-11-02T05:07:15.705Z)
