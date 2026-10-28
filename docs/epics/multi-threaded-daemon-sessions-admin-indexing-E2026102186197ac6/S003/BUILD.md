<!-- insrc:artifact BUILD-86197ac660732ceb-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-28T06:11:04.160Z  ·  **Updated:** 2026-10-28T06:22:10.306Z

**Commit:** 2ba5a8688

## Summary

Nested in-daemon calls are routed per method (inDaemonTarget): admin/indexing to their workers, shared-state methods (and the in-daemon-only chat.dropSession) to the shared-state worker once session work is routed, others inline; the session purge's chat drop and todos cleanup become nested calls with daemon threads and stay in process without them.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/threads/__tests__/registry-board.test.ts` — **insrc-build** (2026-10-28T06:22:10.306Z)
- `src/daemon/threads/__tests__/router.test.ts` — **insrc-build** (2026-10-28T06:22:10.306Z)
- `src/daemon/threads/registry.ts` — **insrc-build** (2026-10-28T06:22:10.306Z)
- `src/daemon/threads/router.ts` — **insrc-build** (2026-10-28T06:22:10.306Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-28T06:22:10.306Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-10-28T06:22:10.306Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-28T06:22:10.306Z)
- `src/daemon/__tests__/workflow-run-registry.test.ts` — **insrc-build** (2026-10-28T06:22:10.306Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-28T06:22:10.306Z)
- `src/daemon/threads/__tests__/helpers/run-board-worker.ts` — **insrc-build** (2026-10-28T06:22:10.306Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-28T06:22:10.306Z)
- `src/daemon/workflow-run-registry.ts` — **insrc-build** (2026-10-28T06:22:10.306Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-28T06:22:10.306Z)
- `src/daemon/steps/daemon-client.ts` — **insrc-build** (2026-10-28T06:22:10.306Z)
- `src/daemon/threads/__tests__/helpers/shared-fake-worker.ts` — **insrc-build** (2026-10-28T06:22:10.306Z)
- `src/daemon/threads/__tests__/indexing-port.test.ts` — **insrc-build** (2026-10-28T06:22:10.306Z)
- `src/daemon/threads/__tests__/maintenance-lock.test.ts` — **insrc-build** (2026-10-28T06:22:10.306Z)
- `src/daemon/threads/__tests__/purge-shared.test.ts` — **insrc-build** (2026-10-28T06:22:10.306Z)
