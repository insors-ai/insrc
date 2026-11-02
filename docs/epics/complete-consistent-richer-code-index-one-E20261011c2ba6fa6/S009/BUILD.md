<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s9 -->

# Build (plan-driven) — Story s9

**Standalone:** no  ·  **Created:** 2026-11-02T05:01:33.548Z  ·  **Updated:** 2026-11-02T05:34:48.328Z

**Commit:** b8a2832cf

## Summary

Added the C# reader (src/indexer/parser/csharp.ts) behind the guarded load of tree-sitter-c-sharp 0.23.1. It reads class/record/struct as class, interface as interface, and enum/delegate as type, with names folded by namespace (block or file-scoped) and by enclosing type. Methods and constructors become Type.Name methods, with DEFINES. using directives become nuget module stubs. Calls are recorded by name (M(), this.M(), Type.M()), and base lists give INHERITS or IMPLEMENTS. A callee or base that names a member of an enclosing type or namespace in the same file is qualified to it, innermost first, so same-file references link. A call through a using namespace stays pending (the documented limitation). A new integration test indexes a mixed Rust/C#/C/C++ repository through IndexerService (ac1). Left out: properties, fields and events are not entities; calls through a value and object creation are not recorded.

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

- `package-lock.json` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `package.json` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/db/__tests__/repo-strict-contract.test.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/db/graph/__tests__/migration-v6-to-v7.test.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/db/graph/keys.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/indexer/resolver.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/shared/repo-namespaces.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/daemon/threads/__tests__/indexing-worker.test.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/indexer/parser/__tests__/registry-languages.test.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/indexer/parser/kotlin.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/indexer/parser/registry.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/indexer/__tests__/cross-file-c-family.test.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/indexer/parser/__tests__/c.test.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/indexer/parser/c.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/indexer/__tests__/c-calls-cpp-header.test.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/indexer/parser/__tests__/cpp.test.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/indexer/parser/cpp.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/indexer/parser/__tests__/rust.test.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/indexer/parser/rust.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/indexer/__tests__/mixed-native-languages.test.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/indexer/parser/__tests__/csharp.test.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
- `src/indexer/parser/csharp.ts` — **insrc-build** (2026-11-02T05:34:48.328Z)
