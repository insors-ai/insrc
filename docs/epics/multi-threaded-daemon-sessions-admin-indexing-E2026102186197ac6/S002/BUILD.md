<!-- insrc:artifact BUILD-86197ac660732ceb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-22T08:05:05.885Z  ·  **Updated:** 2026-10-22T08:08:05.117Z

**Commit:** 6ce2d867

## Summary

Added src/daemon/threads/method-class.ts (sc5): a frozen [method, class, stream] row for every served method — 10 admin, 10 indexing, 156 other unary methods and 16 stream methods as session — with methodClasses.classOf and entries. Its only import is the type-only MethodClass. The coverage test builds the tables through buildHandlerRuntime and reports missing and stale entries (including a wrong stream flag); it is also run against drifted tables to show both kinds are caught. A worker loads the module alone.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/delivery-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:08:05.117Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-10-22T08:08:05.117Z)
- `src/daemon/__tests__/list-models.test.ts` — **insrc-build** (2026-10-22T08:08:05.117Z)
- `src/daemon/__tests__/repo-stats-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:08:05.117Z)
- `src/daemon/__tests__/server-registry.test.ts` — **insrc-build** (2026-10-22T08:08:05.117Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-22T08:08:05.117Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-22T08:08:05.117Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-22T08:08:05.117Z)
- `src/daemon/threads/__tests__/helpers/method-class-worker.ts` — **insrc-build** (2026-10-22T08:08:05.117Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-10-22T08:08:05.117Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-22T08:08:05.117Z)
