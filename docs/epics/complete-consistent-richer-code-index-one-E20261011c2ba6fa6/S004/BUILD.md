<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-11T09:49:16.267Z  ·  **Updated:** 2026-10-11T09:57:20.461Z

**Commit:** 2495f8ab

## Summary

A child-process helper (store-child.ts and its driver) holds a graph store and obeys commands; the reproduction test runs the breaking sequence against the real library on a temporary store and asserts each behaviour separately. Finding beyond the design: a read fails with code -30775 only in a process that never read; a process that had read (as the daemon always has, since the store module reads while opening) gets code 22 with MDB_BAD_RSLOT. Both are pinned, plus a control case. The detection of Tasks t4 and t5 must recognise both.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/LLD-c2ba6fa62a148ed1-s4.json` — **insrc-build** (2026-10-11T09:57:20.461Z)
- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s4.json` — **insrc-build** (2026-10-11T09:57:20.461Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S004/PLAN.md` — **insrc-build** (2026-10-11T09:57:20.461Z)
- `scripts/daemon-ctl.sh` — **insrc-build** (2026-10-11T09:57:20.461Z)
- `src/cli/__tests__/command.test.ts` — **insrc-build** (2026-10-11T09:57:20.461Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-11T09:57:20.461Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-11T09:57:20.461Z)
- `src/cli/panes/DaemonPane.tsx` — **insrc-build** (2026-10-11T09:57:20.461Z)
- `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` — **insrc-build** (2026-10-11T09:57:20.461Z)
- `src/cli/services/__tests__/daemon-stop-forced.test.ts` — **insrc-build** (2026-10-11T09:57:20.461Z)
- `src/cli/services/__tests__/daemon-stop.test.ts` — **insrc-build** (2026-10-11T09:57:20.461Z)
- `src/cli/services/daemon.ts` — **insrc-build** (2026-10-11T09:57:20.461Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-11T09:57:20.461Z)
- `src/cli/services/maintenance.ts` — **insrc-build** (2026-10-11T09:57:20.461Z)
- `src/db/graph/__tests__/helpers/store-child-driver.ts` — **insrc-build** (2026-10-11T09:57:20.461Z)
- `src/db/graph/__tests__/helpers/store-child.ts` — **insrc-build** (2026-10-11T09:57:20.461Z)
- `src/db/graph/__tests__/lock-loss-reproduction.test.ts` — **insrc-build** (2026-10-11T09:57:20.461Z)
