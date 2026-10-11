<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-11T09:49:16.267Z  ·  **Updated:** 2026-10-11T09:53:01.556Z

**Commit:** f48863cf

## Summary

scripts/daemon-ctl.sh gains one forced-stop function, called by cmd_stop and by the stale-daemon branch of cmd_start: after the wait it kills the pid only when its command line ends in daemon/index.js, removes the pid file and socket, and logs the 'killed' line; a live pid that is not a daemon is left alone and the script exits 4 naming it. The wait is overridable through INSRC_CTL_STOP_WAIT_SECS. A killed process not yet collected by its parent counts as gone.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/LLD-c2ba6fa62a148ed1-s4.json` — **insrc-build** (2026-10-11T09:53:01.556Z)
- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s4.json` — **insrc-build** (2026-10-11T09:53:01.556Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S004/PLAN.md` — **insrc-build** (2026-10-11T09:53:01.556Z)
- `scripts/daemon-ctl.sh` — **insrc-build** (2026-10-11T09:53:01.556Z)
- `src/cli/__tests__/command.test.ts` — **insrc-build** (2026-10-11T09:53:01.556Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-11T09:53:01.556Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-11T09:53:01.556Z)
- `src/cli/panes/DaemonPane.tsx` — **insrc-build** (2026-10-11T09:53:01.556Z)
- `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` — **insrc-build** (2026-10-11T09:53:01.556Z)
- `src/cli/services/__tests__/daemon-stop-forced.test.ts` — **insrc-build** (2026-10-11T09:53:01.556Z)
- `src/cli/services/__tests__/daemon-stop.test.ts` — **insrc-build** (2026-10-11T09:53:01.556Z)
- `src/cli/services/daemon.ts` — **insrc-build** (2026-10-11T09:53:01.556Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-11T09:53:01.556Z)
- `src/cli/services/maintenance.ts` — **insrc-build** (2026-10-11T09:53:01.556Z)
