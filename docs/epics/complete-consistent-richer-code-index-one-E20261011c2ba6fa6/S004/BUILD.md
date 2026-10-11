<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-11T09:49:16.267Z  ·  **Updated:** 2026-10-11T10:06:37.979Z

**Commit:** b5e5dfcf

## Summary

The request server's three catch sites and the queue's job runner record a store lock failure (through recordStoreFailureIfLockError) before the error is reduced to a message, and answer or log LmdbStoreLocksLostError. The periodic reader check now probes the store with one read and records a failure; the daemon starts it through startPeriodicReaderCheck, whose interval the test shortens. As recorded on the design, a lock failure on a read is code -30775 or code 22 with MDB_BAD_RSLOT.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/LLD-c2ba6fa62a148ed1-s4.json` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s4.json` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S004/LLD.md` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S004/PLAN.md` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `scripts/daemon-ctl.sh` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/cli/__tests__/command.test.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/cli/panes/DaemonPane.tsx` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/cli/services/__tests__/daemon-stop-forced.test.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/cli/services/__tests__/daemon-stop.test.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/cli/services/daemon.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/cli/services/maintenance.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/daemon/__tests__/store-failure-dispatch.test.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/db/graph/__tests__/helpers/store-child-driver.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/db/graph/__tests__/lock-loss-detection.test.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/db/graph/__tests__/lock-loss-reproduction.test.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/db/graph/__tests__/store-health.test.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-11T10:06:37.979Z)
