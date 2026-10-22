<!-- insrc:artifact BUILD-315d510cb28100e2-s7 -->

# Build (plan-driven) — Story s7

**Standalone:** no  ·  **Created:** 2026-10-22T15:59:53.331Z  ·  **Updated:** 2026-10-22T17:13:56.117Z

**Commit:** e09a9d18

## Summary

End-to-end test over the real gate, lifecycle and an in-memory tracker. Smoke run by the builder against the real GitHub adapter on subhagho/FieldML: claim on issue #3 (assignee subhagho), DEF and HLD submitted as one signoff PR #4, next stage (design.story) refused with awaiting-signoff while the PR was open, PR merged by the owner (admin merge: no second account exists to approve), next stage attempt then recorded both artifacts signed-off, released the claim (assignee null) and the gate allowed the stage. A first run (PR #2, adapter only) is superseded. Temporary issues closed; the smoke branches were deleted on merge.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/team/__tests__/signoff-hook.test.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/team/__tests__/signoff.test.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/team/signoff.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/team/__tests__/signoff-hold.test.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/team/__tests__/signoff-registration.test.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/__tests__/signoff-hold.test.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/artifact-core/__tests__/completion-holds.test.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/artifact-core/lifecycle-service.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/tracker/__tests__/github-adapter.test.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/tracker/__tests__/github-signoff.test.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/tracker/__tests__/port.test.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/cli/__tests__/team-park-resume.test.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/cli/services/team.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/daemon/__tests__/team-settle.test.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/daemon/steps/build-step/phases/implement.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/daemon/steps/workflow-step/handoff-rpc.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/daemon/steps/workflow-step/phases/settle.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/daemon/steps/workflow-step/resume.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/daemon/steps/workflow-step/signoff-registration.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/team/author-gate.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/cli/__tests__/command.test.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/__tests__/signoff-view.test.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/chain.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/delivery/__tests__/signoff-delivery.test.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/delivery/gate.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/delivery/snapshot.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/delivery/types.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
- `src/workflow/team/__tests__/signoff-e2e.test.ts` — **insrc-build** (2026-10-22T17:13:56.117Z)
