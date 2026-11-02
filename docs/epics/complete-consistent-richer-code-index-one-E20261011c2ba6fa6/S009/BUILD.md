<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s9 -->

# Build (plan-driven) — Story s9

**Standalone:** no  ·  **Created:** 2026-11-02T05:01:33.548Z  ·  **Updated:** 2026-11-02T06:53:26.221Z

**Commit:** a50932345

## Summary

Full sweep at 2b6a06d..e9df926 (/tmp/sweep-s9.log): 7098 passed, 33 failed, and none of the 33 comes from s9. Two stale assertions from earlier stories of this epic were fixed in b26dd1cd7: the board's backfill lane, and the store database count with entity_by_file. 16 were load flakes that pass when run alone. 10 are the seeded-test-daemon start failure, which predates s9; the daemon built from current source starts in 3 s. The rest are in the other session's connection-manager and data-driver areas. Pushed and updated the installed daemon to b26dd1cd. The update skipped npm install: an earlier update's install had failed on fs-ext, from the other session's project-memory package. I installed with --ignore-scripts and rebuilt the five grammars. Smoke on the installed daemon: index.languages lists all twelve available. /tmp/insrc-s9-smoke indexes Rust, C, C++, C# and SQL entities with calls; Rust and C-to-header calls across files are inferred, same-file calls extracted. Evidence: S009/smoke-t9.txt.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `package-lock.json` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `package.json` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/db/__tests__/repo-strict-contract.test.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/db/graph/__tests__/migration-v6-to-v7.test.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/db/graph/keys.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/shared/repo-namespaces.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/daemon/threads/__tests__/indexing-worker.test.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/indexer/parser/__tests__/registry-languages.test.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/indexer/parser/kotlin.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/indexer/parser/registry.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/indexer/__tests__/cross-file-c-family.test.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/indexer/parser/__tests__/c.test.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/indexer/__tests__/mixed-native-languages.test.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/indexer/__tests__/sql-index.test.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/indexer/parser/artifact.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/daemon/threads/__tests__/board-amendments.test.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S009/smoke-t9.txt` — **insrc-build** (2026-11-02T06:08:28.502Z)
- `src/indexer/resolver.ts` — **insrc-build** (2026-11-02T06:53:26.221Z)
- `src/indexer/parser/c.ts` — **insrc-build** (2026-11-02T06:53:26.221Z)
- `src/indexer/__tests__/c-calls-cpp-header.test.ts` — **insrc-build** (2026-11-02T06:53:26.221Z)
- `src/indexer/parser/__tests__/cpp.test.ts` — **insrc-build** (2026-11-02T06:53:26.221Z)
- `src/indexer/parser/cpp.ts` — **insrc-build** (2026-11-02T06:53:26.221Z)
- `src/indexer/parser/__tests__/rust.test.ts` — **insrc-build** (2026-11-02T06:53:26.221Z)
- `src/indexer/parser/rust.ts` — **insrc-build** (2026-11-02T06:53:26.221Z)
- `src/indexer/parser/__tests__/csharp.test.ts` — **insrc-build** (2026-11-02T06:53:26.221Z)
- `src/indexer/parser/csharp.ts` — **insrc-build** (2026-11-02T06:53:26.221Z)
- `src/indexer/parser/__tests__/sql.test.ts` — **insrc-build** (2026-11-02T06:53:26.221Z)
- `src/indexer/parser/sql.ts` — **insrc-build** (2026-11-02T06:53:26.221Z)
