<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s9 -->

# Build (plan-driven) — Story s9

**Standalone:** no  ·  **Created:** 2026-11-02T05:01:33.548Z  ·  **Updated:** 2026-11-02T05:27:53.386Z

**Commit:** d031e5656

## Summary

Added the Rust reader (src/indexer/parser/rust.ts) behind the guarded load. It reads fn as function, impl/trait members as Type::name methods, struct/enum/union as class, and trait as interface, with DEFINES; an inline mod folds its name into the names inside it. `mod x;` and crate::/self::/super::/declared-module use paths become relative IMPORTS. External crates become cargo module stubs. Calls are recorded by name, and `impl Trait for Type` gives IMPLEMENTS. resolveImportPath gains resolveRustModulePath: the longest existing module file wins, x.rs before x/mod.rs. A path that lands on the importing file links nothing. collectCalls in c.ts now takes the callee node types. The t2 registry test's unavailable-reader probe moved from rust to proto. Left out: method calls through a value and macro invocations.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `package-lock.json` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `package.json` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/db/__tests__/repo-strict-contract.test.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/db/graph/__tests__/migration-v6-to-v7.test.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/db/graph/keys.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/indexer/resolver.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/shared/repo-namespaces.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/daemon/threads/__tests__/indexing-worker.test.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/indexer/parser/__tests__/registry-languages.test.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/indexer/parser/kotlin.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/indexer/parser/registry.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/indexer/__tests__/cross-file-c-family.test.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/indexer/parser/__tests__/c.test.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/indexer/parser/c.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/indexer/__tests__/c-calls-cpp-header.test.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/indexer/parser/__tests__/cpp.test.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/indexer/parser/cpp.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/indexer/parser/__tests__/rust.test.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
- `src/indexer/parser/rust.ts` — **insrc-build** (2026-11-02T05:27:53.386Z)
