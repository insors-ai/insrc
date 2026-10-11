<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-11T09:49:16.267Z  ·  **Updated:** 2026-10-11T10:31:05.314Z

**Commit:** 0f2dd749

## Summary

The shutdown sequence and the fatal-error handler move from the daemon's entry point into src/daemon/shutdown.ts and src/daemon/fatal.ts; every exit goes through exitRespectingStoreHealth. With the store's health locks-lost the daemon does not wait for the queue or close the store: it removes its pid file and socket, writes one last line synchronously, and sends itself SIGKILL; the same ending replaces the exit after the drain, at the backstop and after a fatal error. closeGraphStore now probes before closing, so an unmet failure is found there. Beyond the plan's text: the SIGKILL is delayed 50 ms so the answer to the stop request leaves the socket. The real daemon entry was also started and stopped in a temporary home (clean exit, pid file and socket removed). One combined run of the daemon suites stalled in store-failure-dispatch.test.ts; it did not recur in eight repeats and the cause is not known; the tests' socket requests are now bounded.

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

- `.insrc/artifacts/LLD-c2ba6fa62a148ed1-s4.json` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s4.json` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S004/LLD.md` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S004/PLAN.md` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ops/DaemonConfigurable.kt` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonStatusGatewayTest.kt` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `scripts/daemon-ctl.sh` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/cli/__tests__/command.test.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/cli/panes/DaemonPane.tsx` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/cli/services/__tests__/daemon-stop-forced.test.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/cli/services/__tests__/daemon-stop.test.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/cli/services/daemon.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/cli/services/maintenance.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/daemon/__tests__/shutdown-store-failure.test.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/daemon/__tests__/status-store-failure.test.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/daemon/__tests__/store-failure-dispatch.test.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/daemon/fatal.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/daemon/shutdown.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/daemon/status.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/db/graph/__tests__/helpers/store-child-driver.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/db/graph/__tests__/lock-loss-detection.test.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/db/graph/__tests__/lock-loss-reproduction.test.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/db/graph/__tests__/store-health.test.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `vscode-plugin/src/panels/__tests__/daemon-gateway.test.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
- `vscode-plugin/src/panels/daemon-gateway.ts` — **insrc-build** (2026-10-11T10:31:05.314Z)
