<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-11T09:49:16.267Z  ·  **Updated:** 2026-10-11T10:02:56.088Z

**Commit:** fa7c3218

## Summary

The store module gains a health record (set once to locks-lost, never cleared in the process), getStoreHealth, recordStoreFailureIfLockError and LmdbStoreLocksLostError. withWriteTxn bounds its wait at 10 seconds and probes with one read; withWriteTxnSync confirms a code 22 or -30775 failure with the same probe. Once recorded, getGraphStore and both wrappers refuse without reaching the library and closeGraphStore skips the library's close. Deviation from the design text, recorded on the design: a read counts as a lock failure by code -30775 or by code 22 with MDB_BAD_RSLOT, since Task t3 showed that a process which has read before (as the daemon has) gets the second.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/LLD-c2ba6fa62a148ed1-s4.json` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s4.json` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S004/LLD.md` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S004/PLAN.md` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `scripts/daemon-ctl.sh` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `src/cli/__tests__/command.test.ts` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `src/cli/panes/DaemonPane.tsx` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `src/cli/services/__tests__/daemon-stop-forced.test.ts` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `src/cli/services/__tests__/daemon-stop.test.ts` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `src/cli/services/daemon.ts` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `src/cli/services/maintenance.ts` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `src/db/graph/__tests__/helpers/store-child-driver.ts` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `src/db/graph/__tests__/lock-loss-detection.test.ts` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `src/db/graph/__tests__/lock-loss-reproduction.test.ts` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `src/db/graph/__tests__/store-health.test.ts` — **insrc-build** (2026-10-11T10:02:56.088Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-11T10:02:56.088Z)
