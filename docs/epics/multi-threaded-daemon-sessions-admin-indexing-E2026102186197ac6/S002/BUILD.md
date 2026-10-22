<!-- insrc:artifact BUILD-86197ac660732ceb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-22T08:05:05.885Z  ·  **Updated:** 2026-10-22T08:21:14.153Z

**Commit:** eb38fa92

## Summary

IpcServer now takes forward(request, deliver) => cancel (plus now? and socketPath?) instead of handler tables; framing, the attached-client registry and reply writing are unchanged. Each connection tracks its in-flight requests, and a socket close cancels them: a stream is aborted, a unary reply is dropped. onRegistryChange(listener) fires on connect, on close, and after each message updates the registry, before the request is forwarded. directDispatch(rpc, stream) reproduces today's dispatch rules. handleMessage still returns a promise, settled when the request ends. All nine construction sites use directDispatch. The new wire test was also run once against a scratch copy of the original server, which gave identical replies. The test mapping now covers every suite the acceptance check names: server-registry, store-failure-dispatch, update-handlers, understanding-rpc, step-host, forward-step, mcp-process-e2e, and the store-child suites shutdown-store-failure, steering-refresh-through-daemon and review-source-roots-daemon.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/delivery-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/daemon/__tests__/list-models.test.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/daemon/__tests__/repo-stats-handler-contract.test.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/daemon/__tests__/server-registry.test.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/mcp/__tests__/import-graph.test.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/daemon/threads/__tests__/helpers/method-class-worker.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/daemon/__tests__/server-forward.test.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/daemon/__tests__/store-failure-dispatch.test.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/daemon/__tests__/understanding-rpc.test.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/daemon/__tests__/update-handlers.test.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
- `src/mcp/__tests__/mcp-process-e2e.test.ts` — **insrc-build** (2026-10-22T08:21:14.153Z)
