<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s9 -->

# Build (plan-driven) — Story s9

**Standalone:** no  ·  **Created:** 2026-11-02T05:01:33.548Z  ·  **Updated:** 2026-11-02T05:20:51.601Z

**Commit:** b0e4f9d74

## Summary

Added the C++ reader (src/indexer/parser/cpp.ts) for .cpp/.cc/.cxx/.hpp/.hh/.hxx/.h, behind the guarded load. It reads classes and structs with INHERITS from their bases, and members as Class::name with their access. Qualified out-of-line definitions are attached to their class. Free functions and prototypes are kept (a definition takes precedence), and types are read. Namespaces are folded into names; a function in an anonymous namespace or declared static is not exported. Includes and calls are handled as in C. Left out: calls through an object (obj.m()) are not recorded, and an unqualified name inside a namespace matches only a target of exactly that name.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `package-lock.json` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `package.json` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/db/__tests__/repo-strict-contract.test.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/db/__tests__/search-evidence.test.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/db/graph/__tests__/migration-v4-to-v5.test.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/db/graph/__tests__/migration-v6-to-v7.test.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/db/graph/__tests__/operational.test.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/db/graph/codec.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/db/graph/keys.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/db/graph/migrations.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/indexer/resolver.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/shared/repo-namespaces.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/daemon/threads/__tests__/indexing-worker.test.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/indexer/parser/__tests__/registry-languages.test.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/indexer/parser/kotlin.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/indexer/parser/registry.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/indexer/__tests__/cross-file-c-family.test.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/indexer/cross-file-resolver.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/indexer/index.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/indexer/parser/__tests__/c.test.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/indexer/parser/c.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/indexer/__tests__/c-calls-cpp-header.test.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/indexer/parser/__tests__/cpp.test.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
- `src/indexer/parser/cpp.ts` — **insrc-build** (2026-11-02T05:20:51.601Z)
