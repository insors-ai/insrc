<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T17:20:30.641Z

**Commit:** 53e59f21

## Summary

The judge was right that handoff-ownership.test.ts did not exercise a step turn or the snapshot after a turn. It now seeds an approved Define (revision 3), HLD (5) and Story LLD (7) the way plan-e2e does and drives the real plan workflow through handleWorkflowStep: start (stored entry meta has owner alice and the snapshot LLD 7, HLD 5, Define 3), then phase plan (new token; owner and the whole upstream list equal the start's; the superseded token is gone), then phase step for s1 and again for s2 (each new token keeps the owner and the identical upstream list, and each releases the token it decoded). A second half runs the same start and plan turn with a no-policy repo: both stored entries have meta undefined and the tracker loader is never called. The other test file and the implementation are unchanged from the first submission; tsc clean; workflow-step, team and daemon suites pass.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T17:20:30.641Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T17:20:30.641Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T17:20:30.641Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T17:20:30.641Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T17:20:30.641Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T17:20:30.641Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T17:20:30.641Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T17:20:30.641Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T17:20:30.641Z)
