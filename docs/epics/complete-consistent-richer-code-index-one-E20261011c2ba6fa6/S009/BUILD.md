<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s9 -->

# Build (plan-driven) — Story s9

**Standalone:** no  ·  **Created:** 2026-11-02T05:01:33.548Z  ·  **Updated:** 2026-11-02T05:09:48.138Z

**Commit:** ba35c2a89

## Summary

The cross-file pass treats C and C++ as one language family when matching call and inheritance targets; other languages still match only themselves.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `package-lock.json` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `package.json` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/db/__tests__/repo-strict-contract.test.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/db/graph/__tests__/migration-v6-to-v7.test.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/db/graph/keys.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/indexer/resolver.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/shared/repo-namespaces.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/daemon/threads/__tests__/indexing-worker.test.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/indexer/parser/__tests__/registry-languages.test.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/indexer/parser/kotlin.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/indexer/parser/registry.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/indexer/__tests__/cross-file-c-family.test.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-02T05:09:48.138Z)
