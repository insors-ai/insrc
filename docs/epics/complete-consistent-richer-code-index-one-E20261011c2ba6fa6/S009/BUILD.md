<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s9 -->

# Build (plan-driven) — Story s9

**Standalone:** no  ·  **Created:** 2026-11-02T05:01:33.548Z  ·  **Updated:** 2026-11-02T05:41:47.671Z

**Commit:** 906458b2e

## Summary

Added the SQL reader (src/indexer/parser/sql.ts), which now owns .sql (removed from the artifact reader's extensions) behind the guarded load of @derekstride/tree-sitter-sql. It writes the artifact reader's file and document entities unchanged: same ids, names, flags, body truncation and size limit. It adds a table or view entity per CREATE TABLE / CREATE [OR REPLACE] VIEW, named by the unquoted, schema-qualified name, with DEFINES. REFERENCES go from tables to their foreign-key targets and from views to the relations they select from; the view's own CTE names are excluded and duplicates are merged. Same-file references are resolved by case-insensitive unquoted name; others stay pending by name (user decision). CREATEs inside transaction blocks and outside ERROR regions are read. New: an IndexerService SQL integration test and the twelve-languages check (ac4). Left out: other statement kinds, and DML outside views.

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

- `package-lock.json` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `package.json` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/db/__tests__/repo-strict-contract.test.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/db/graph/__tests__/migration-v6-to-v7.test.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/db/graph/keys.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/resolver.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/shared/repo-namespaces.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/daemon/threads/__tests__/indexing-worker.test.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/parser/__tests__/registry-languages.test.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/parser/kotlin.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/parser/registry.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/__tests__/cross-file-c-family.test.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/parser/__tests__/c.test.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/parser/c.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/__tests__/c-calls-cpp-header.test.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/parser/__tests__/cpp.test.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/parser/cpp.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/parser/__tests__/rust.test.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/parser/rust.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/__tests__/mixed-native-languages.test.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/parser/__tests__/csharp.test.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/parser/csharp.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/__tests__/sql-index.test.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/parser/__tests__/sql.test.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/parser/artifact.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
- `src/indexer/parser/sql.ts` — **insrc-build** (2026-11-02T05:41:47.671Z)
