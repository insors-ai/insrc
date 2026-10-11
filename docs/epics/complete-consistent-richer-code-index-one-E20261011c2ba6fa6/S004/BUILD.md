<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-11T09:49:16.267Z  ·  **Updated:** 2026-10-11T09:49:16.267Z

**Commit:** 8a26a499

## Summary

stopDaemon now bounds its shutdown request at 5 seconds, waits as before, and ends a daemon that overruns the wait by SIGKILL, but only a pid whose command line ends in daemon/index.js; it removes the pid file and socket after a kill and returns how the stop ended. restart reports a forced stop ('force-stop') and goes on to start. The service type and the three callers are updated.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/LLD-c2ba6fa62a148ed1-s4.json` — **insrc-build** (2026-10-11T09:49:16.267Z)
- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s4.json` — **insrc-build** (2026-10-11T09:49:16.267Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S004/PLAN.md` — **insrc-build** (2026-10-11T09:49:16.267Z)
- `src/cli/__tests__/command.test.ts` — **insrc-build** (2026-10-11T09:49:16.267Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-11T09:49:16.267Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-11T09:49:16.267Z)
- `src/cli/panes/DaemonPane.tsx` — **insrc-build** (2026-10-11T09:49:16.267Z)
- `src/cli/services/__tests__/daemon-stop-forced.test.ts` — **insrc-build** (2026-10-11T09:49:16.267Z)
- `src/cli/services/__tests__/daemon-stop.test.ts` — **insrc-build** (2026-10-11T09:49:16.267Z)
- `src/cli/services/daemon.ts` — **insrc-build** (2026-10-11T09:49:16.267Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-11T09:49:16.267Z)
- `src/cli/services/maintenance.ts` — **insrc-build** (2026-10-11T09:49:16.267Z)
