<!-- insrc:artifact BUILD-86197ac660732ceb-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-29T08:13:45.184Z  ·  **Updated:** 2026-10-29T08:13:45.184Z

**Commit:** 804daf0bc

## Summary

With daemon threads enabled, the main thread no longer builds its handler runtime at boot: lazyForward (src/daemon/threads/lazy-runtime.ts) builds buildHandlerRuntime, the in-daemon client and installStepDaemonClient on the first request the router keeps local, logs 'handler runtime built on the main thread', answers a failed build with its error and retries on the next request; shutdown stops understanding routes only if built. With threads disabled the runtime is built at boot as before. The daemon-level proof that routed requests leave it unbuilt is t6.

## Tasks validated

- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-29T08:13:45.184Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-29T08:13:45.184Z)
- `src/daemon/threads/__tests__/lazy-runtime.test.ts` — **insrc-build** (2026-10-29T08:13:45.184Z)
- `src/daemon/threads/lazy-runtime.ts` — **insrc-build** (2026-10-29T08:13:45.184Z)
