<!-- insrc:artifact BUILD-cda6558e4b0e4bea-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-13T06:27:53.175Z  ·  **Updated:** 2026-11-13T08:23:42.529Z

**Commit:** 1a6d72e6e

## Summary

Ran the full sweep in per-directory foreground chunks and hardened the suite against parallel-load flakiness. The retry-EEXIST test's child-process racer was structurally descheduled at its readiness pipe write (the write that wakes the competitor), losing the 50us retry window under load (measured 25% win rate, full budget exhaustion in 2/10 runs); it now uses four worker-thread racers that never block between reporting spinning and the window, verified 12/12 under the full-parallel src/shared suite that reproduced the flake, plus a self-healing daemonLog mode fixture for sweep runs killed mid-log-write-failure. The sweep surfaced exactly two assertions of the old fail-closed contract (dead owner -> refused restart): the control-script orphan-guard scenario and the shutdown-lifecycle-evidence guard-death scenario; both now assert the story's contract (quarantine with byte-identical record, restart proceeds like the healthy control). Every remaining sweep failure was re-run at the pre-story baseline (worktree at 24b73cdfe) with identical failure sets - zero story-caused failures. The sweep itself does not exit clean on this v2 baseline: ~130 pre-existing failures (workflow review stub PENDING REVIEW RE-IMPLEMENTATION, config catalog effort enum drift, project-memory evidence hash drift, store-child fixture trio, and others) that predate the story and need their own tracked issues; see commit 1a6d72e6e. The three failing shutdown-store-failure cases fail identically at the baseline; no shutdown or supervisor case was broken by the story, and the one shutdown-evidence scenario change is the story-mandated contract update (same class as t1's killed-owner rewrite).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✗ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/shared/__tests__/daemon-run-files.test.ts` — **insrc-build** (2026-11-13T08:23:42.529Z)
- `src/shared/daemon-run-files.ts` — **insrc-build** (2026-11-13T08:23:42.529Z)
- `src/daemon/__tests__/keystore-guard.test.ts` — **insrc-build** (2026-11-13T08:23:42.529Z)
- `src/daemon/__tests__/run-file-ownership.test.ts` — **insrc-build** (2026-11-13T08:23:42.529Z)
- `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` — **insrc-build** (2026-11-13T08:23:42.529Z)
- `src/daemon/__tests__/shutdown-lifecycle-evidence.test.ts` — **insrc-build** (2026-11-13T08:23:42.529Z)
