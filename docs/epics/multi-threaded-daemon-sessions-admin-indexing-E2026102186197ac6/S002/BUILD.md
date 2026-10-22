<!-- insrc:artifact BUILD-86197ac660732ceb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-22T08:05:05.885Z  ·  **Updated:** 2026-10-22T08:05:05.885Z

**Commit:** e3f1203a

## Summary

Moved the construction of the rpc and stream handler tables (from the session-purge pipeline through the understanding-route merge), with the offline-stub and step.call helpers, from main() into buildHandlerRuntime(deps) in src/daemon/handler-runtime.ts. deps carries db, configStore, queue, indexer and startedAt, plus three late-bound functions for things main() creates after the tables: shutdown, the server's attachedClients and the understanding service. A diff of the moved block against the original shows only those three reads changed; every handler body is otherwise byte-identical. main() calls the function with the real queue and indexer. Four source-scan tests that read handler code from index.ts now read handler-runtime.ts (titles unchanged). Run: the new key-set test, the 7 related daemon/MCP source and registry suites (40/40), and the MCP and step suites (499/499); the src/daemon directory suite was not completed, per the user's rule to run the full sweep once at the end.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/delivery-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:05:05.885Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-10-22T08:05:05.885Z)
- `src/daemon/__tests__/list-models.test.ts` — **insrc-build** (2026-10-22T08:05:05.885Z)
- `src/daemon/__tests__/repo-stats-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:05:05.885Z)
- `src/daemon/__tests__/server-registry.test.ts` — **insrc-build** (2026-10-22T08:05:05.885Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-22T08:05:05.885Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-22T08:05:05.885Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-22T08:05:05.885Z)
